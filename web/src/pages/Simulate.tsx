import { useState } from 'react'
import { Alert, App, Button, Card, Descriptions, Flex, Input, Segmented, Tag, Typography } from 'antd'
import { SearchOutlined, SendOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n, type MessageKey, type T } from '../i18n'
import type { SimulateResult } from '../types'

type SampleKey = 'deployOk' | 'deployFail' | 'backupFail' | 'serverDown'

const sample = (key: SampleKey, t: T): object => {
  switch (key) {
    case 'deployOk':
      return {
        success: true, event: 'deployment_success', message: 'New version successfully deployed',
        application_name: 'my-app', application_uuid: 'abc123', project: 'shop', environment: 'production',
        fqdn: 'https://shop.example.com',
      }
    case 'deployFail':
      return {
        success: false, event: 'deployment_failed', message: 'Deployment failed',
        application_name: 'my-app', application_uuid: 'abc123', project: 'shop', environment: 'production',
        deployment_url: 'https://coolify.example.com/…',
      }
    case 'backupFail':
      return {
        success: false, event: 'backup_failed', message: 'Database backup failed',
        database_name: 'shop-db', database_uuid: t('sim.uuidPlaceholder'), database_type: 'postgresql', frequency: '0 0 * * *',
      }
    case 'serverDown':
      return { success: false, event: 'server_unreachable', message: 'Server unreachable', server_name: 'main', server_uuid: 'xyz' }
  }
}

const SAMPLE_KEYS: SampleKey[] = ['deployOk', 'deployFail', 'backupFail', 'serverDown']
const fmt = (o: object) => JSON.stringify(o, null, 2)

export default function SimulatePage() {
  const { message } = App.useApp()
  const { t } = useI18n()
  const [current, setCurrent] = useState<SampleKey>('deployFail')
  const [body, setBody] = useState(() => fmt(sample('deployFail', t)))
  const [result, setResult] = useState<SimulateResult>()
  const [busy, setBusy] = useState<'run' | 'send' | null>(null)

  const run = async (send: boolean) => {
    try {
      JSON.parse(body)
    } catch {
      message.error(t('sim.invalidJson'))
      return
    }
    setBusy(send ? 'send' : 'run')
    try {
      const r = await api<SimulateResult>('/api/simulate' + (send ? '?send=1' : ''), { method: 'POST', body })
      setResult(r)
      if (r.sent) message.success(t('sim.queued'))
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const dash = <Typography.Text type="secondary">—</Typography.Text>

  return (
    <Card title={t('sim.title')}>
      <Typography.Paragraph type="secondary">{t('sim.help')}</Typography.Paragraph>
      <Flex vertical gap={12}>
        <Segmented<SampleKey>
          options={SAMPLE_KEYS.map(k => ({ value: k, label: t(`sim.sample.${k}` as MessageKey) }))}
          value={current}
          onChange={k => {
            setCurrent(k)
            setBody(fmt(sample(k, t)))
            setResult(undefined)
          }}
          style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
        />
        <Input.TextArea
          className="mono"
          value={body}
          onChange={e => setBody(e.target.value)}
          autoSize={{ minRows: 10, maxRows: 24 }}
          spellCheck={false}
        />
        <Flex gap={8} wrap>
          <Button type="primary" icon={<SearchOutlined />} loading={busy === 'run'} onClick={() => run(false)}>
            {t('sim.run')}
          </Button>
          <Button icon={<SendOutlined />} loading={busy === 'send'} onClick={() => run(true)}>
            {t('sim.send')}
          </Button>
        </Flex>

        {result && (
          <>
            {result.destinations.length === 0 ? (
              <Alert type="warning" showIcon title={t('sim.nowhere')} description={t('sim.nowhereDesc')} />
            ) : (
              <Alert
                type={result.fallback ? 'info' : 'success'}
                showIcon
                title={
                  <Flex gap={6} wrap align="center">
                    {t('sim.willSend')}
                    {result.destinations.map(d => (
                      <Tag key={d} color="purple">
                        {d}
                      </Tag>
                    ))}
                  </Flex>
                }
                description={result.fallback ? t('sim.viaFallback') : undefined}
              />
            )}
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: 'event', label: t('common.event'), children: <Typography.Text code>{result.event}</Typography.Text> },
                {
                  key: 'project',
                  label: t('common.project'),
                  children: result.project || <Typography.Text type="secondary">{t('common.unknown')}</Typography.Text>,
                },
                { key: 'env', label: t('common.environment'), children: result.environment || dash },
                { key: 'res', label: t('common.resource'), children: result.resource || dash },
              ]}
            />
          </>
        )}
      </Flex>
    </Card>
  )
}
