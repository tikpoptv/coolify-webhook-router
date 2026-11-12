import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Flex, Switch, Table, Tag, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n } from '../i18n'
import type { Delivery } from '../types'

const pretty = (s: string) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export default function HistoryPage() {
  const { message } = App.useApp()
  const { t, dateLocale } = useI18n()
  const [rows, setRows] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [auto, setAuto] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api<Delivery[]>('/api/deliveries'))
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [auto, load])

  const failed = rows.filter(r => !r.ok).length
  // The server stores this one message verbatim; everything else is a raw delivery error.
  const errText = (e: string) => (e === 'no matching rule and no fallback destination' ? t('history.noRoute') : e)

  return (
    <Card
      title={
        <Flex gap={8} align="center">
          {t('history.title')}
          {failed > 0 && <Tag color="error">{t('history.failed', { n: failed })}</Tag>}
        </Flex>
      }
      extra={
        <Flex gap={12} align="center">
          <Flex gap={6} align="center">
            <Switch size="small" checked={auto} onChange={setAuto} />
            <Typography.Text type="secondary" className="hide-mobile">
              {t('history.auto')}
            </Typography.Text>
          </Flex>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading && !auto}>
            {t('common.refresh')}
          </Button>
        </Flex>
      }
    >
      <Table<Delivery>
        rowKey="id"
        size="middle"
        dataSource={rows}
        loading={loading && !rows.length}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 760 }}
        locale={{ emptyText: t('history.empty') }}
        expandable={{
          expandedRowRender: r => (
            <Flex vertical gap={8}>
              {r.error && <Typography.Text type="danger">{errText(r.error)}</Typography.Text>}
              <pre className="payload mono">{pretty(r.payload)}</pre>
            </Flex>
          ),
        }}
        columns={[
          {
            title: '',
            dataIndex: 'ok',
            width: 36,
            render: (ok: boolean) =>
              ok ? (
                <CheckCircleFilled style={{ color: 'var(--ant-color-success)' }} />
              ) : (
                <CloseCircleFilled style={{ color: 'var(--ant-color-error)' }} />
              ),
          },
          {
            title: t('history.col.time'),
            dataIndex: 'time',
            width: 170,
            render: (t: string) => (
              <Typography.Text type="secondary">
                {new Date(t).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'medium' })}
              </Typography.Text>
            ),
          },
          { title: t('common.event'), dataIndex: 'event', render: v => <Typography.Text code>{v}</Typography.Text> },
          {
            title: t('common.project'),
            render: (_, r) =>
              r.project ? (
                <span>
                  {r.project}
                  {r.environment && <Typography.Text type="secondary"> / {r.environment}</Typography.Text>}
                </span>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          { title: t('common.resource'), dataIndex: 'resource', render: v => v || <Typography.Text type="secondary">—</Typography.Text> },
          {
            title: t('common.sendTo'),
            dataIndex: 'destination',
            render: (v: string, r) => (
              <Flex vertical>
                <span>{v}</span>
                {!r.ok && (
                  <Typography.Text type="danger" ellipsis style={{ maxWidth: 260, fontSize: 12 }}>
                    {errText(r.error)}
                  </Typography.Text>
                )}
              </Flex>
            ),
          },
        ]}
      />
    </Card>
  )
}
