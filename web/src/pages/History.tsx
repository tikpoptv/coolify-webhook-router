import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Flex, Switch, Table, Tag, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, ReloadOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
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

  return (
    <Card
      title={
        <Flex gap={8} align="center">
          ประวัติล่าสุด
          {failed > 0 && <Tag color="error">ไม่สำเร็จ {failed}</Tag>}
        </Flex>
      }
      extra={
        <Flex gap={12} align="center">
          <Flex gap={6} align="center">
            <Switch size="small" checked={auto} onChange={setAuto} />
            <Typography.Text type="secondary" className="hide-mobile">
              อัปเดตอัตโนมัติ
            </Typography.Text>
          </Flex>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading && !auto}>
            รีเฟรช
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
        locale={{ emptyText: 'ยังไม่มี event เข้ามา — ลองกด "Send test" ใน Coolify' }}
        expandable={{
          expandedRowRender: r => (
            <Flex vertical gap={8}>
              {r.error && <Typography.Text type="danger">{r.error}</Typography.Text>}
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
            title: 'เวลา',
            dataIndex: 'time',
            width: 170,
            render: (t: string) => (
              <Typography.Text type="secondary">
                {new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })}
              </Typography.Text>
            ),
          },
          { title: 'Event', dataIndex: 'event', render: v => <Typography.Text code>{v}</Typography.Text> },
          {
            title: 'โปรเจค',
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
          { title: 'Resource', dataIndex: 'resource', render: v => v || <Typography.Text type="secondary">—</Typography.Text> },
          {
            title: 'ส่งไปที่',
            dataIndex: 'destination',
            render: (v: string, r) => (
              <Flex vertical>
                <span>{v}</span>
                {!r.ok && (
                  <Typography.Text type="danger" ellipsis style={{ maxWidth: 260, fontSize: 12 }}>
                    {r.error}
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
