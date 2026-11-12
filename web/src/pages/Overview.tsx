import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Col, Flex, Form, Input, Row, Select, Skeleton, Statistic, Typography } from 'antd'
import { ApiOutlined, LinkOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n } from '../i18n'
import type { Destination, Overview } from '../types'
import { TYPE_LABELS } from '../types'

export default function OverviewPage() {
  const { message } = App.useApp()
  const { t, lang, dateLocale } = useI18n()
  const [ov, setOv] = useState<Overview>()
  const [dests, setDests] = useState<Destination[]>([])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [form] = Form.useForm()

  const apply = (o: Overview) => {
    setOv(o)
    form.setFieldsValue({ coolify_url: o.coolify_url, coolify_api_token: '' })
  }

  // Reload when the language changes so server-side status messages follow it.
  useEffect(() => {
    Promise.all([api<Overview>('/api/overview'), api<Destination[]>('/api/destinations')])
      .then(([o, d]) => {
        apply(o)
        setDests(d)
      })
      .catch(e => message.error(errorText(e)))
  }, [lang])

  if (!ov) return <Skeleton active />

  const hookUrl = window.location.origin + ov.hook_path

  const saveCoolify = async (values: { coolify_url: string; coolify_api_token: string }) => {
    setSaving(true)
    try {
      const o = await api<Overview>('/api/settings', { method: 'PUT', body: values })
      apply(o)
      if (o.coolify.error) message.warning(t('overview.coolify.savedButFailed'))
      else message.success(t('common.saved'))
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      apply(await api<Overview>('/api/coolify/refresh', { method: 'POST' }))
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setRefreshing(false)
    }
  }

  const saveFallback = async (id: number) => {
    try {
      apply(await api<Overview>('/api/settings', { method: 'PUT', body: { fallback_destination_id: id } }))
      message.success(t('overview.fallback.saved'))
    } catch (e) {
      message.error(errorText(e))
    }
  }

  const c = ov.coolify

  return (
    <Flex vertical gap={16}>
      <Card
        title={
          <Flex gap={8}>
            <LinkOutlined /> {t('overview.hook.title')}
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">{t('overview.hook.help')}</Typography.Paragraph>
        <Typography.Paragraph
          copyable={{ text: hookUrl, tooltips: [t('overview.copy'), t('overview.copied')] }}
          code
          style={{ marginBottom: 0, wordBreak: 'break-all' }}
        >
          {hookUrl}
        </Typography.Paragraph>
      </Card>

      <Card
        title={
          <Flex gap={8}>
            <ApiOutlined /> {t('overview.coolify.title')}
          </Flex>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={refreshing} disabled={!c.configured}>
            {t('common.reload')}
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">{t('overview.coolify.help')}</Typography.Paragraph>

        {!c.configured ? (
          <Alert
            type="info"
            showIcon
            title={t('overview.coolify.notConfigured')}
            description={t('overview.coolify.notConfiguredDesc')}
            style={{ marginBottom: 16 }}
          />
        ) : c.error ? (
          <Alert type="error" showIcon title={t('overview.coolify.error')} description={c.error} style={{ marginBottom: 16 }} />
        ) : (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={8}>
              <Statistic title={t('overview.coolify.projects')} value={c.projects} />
            </Col>
            <Col xs={8}>
              <Statistic title={t('overview.coolify.resources')} value={c.resources} />
            </Col>
            <Col xs={8}>
              <Statistic
                title={t('overview.coolify.updated')}
                value={new Date(c.loaded_at).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
              />
            </Col>
          </Row>
        )}

        <Form form={form} layout="vertical" onFinish={saveCoolify} requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="coolify_url"
                label={t('overview.coolify.url')}
                rules={[{ pattern: /^https?:\/\//, message: t('common.urlScheme') }]}
              >
                <Input placeholder="https://coolify.example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="coolify_api_token" label={t('overview.coolify.token')}>
                <Input.Password
                  autoComplete="off"
                  placeholder={ov.coolify_token_set ? t('overview.coolify.tokenSet') : t('overview.coolify.tokenPaste')}
                />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Form>
      </Card>

      <Card
        title={
          <Flex gap={8}>
            <SafetyOutlined /> {t('overview.fallback.title')}
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">{t('overview.fallback.help')}</Typography.Paragraph>
        <Select
          style={{ width: '100%', maxWidth: 420 }}
          value={ov.fallback_destination_id || 0}
          onChange={saveFallback}
          options={[
            { value: 0, label: t('overview.fallback.none') },
            ...dests.map(d => ({ value: d.id, label: `${d.name} · ${TYPE_LABELS[d.type]}` })),
          ]}
          notFoundContent={t('overview.fallback.empty')}
        />
      </Card>
    </Flex>
  )
}
