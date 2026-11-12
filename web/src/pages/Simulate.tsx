import { useState } from 'react'
import { Alert, App, Button, Card, Descriptions, Flex, Input, Segmented, Tag, Typography } from 'antd'
import { SearchOutlined, SendOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import type { SimulateResult } from '../types'

const SAMPLES: Record<string, object> = {
  'deploy สำเร็จ': {
    success: true, event: 'deployment_success', message: 'New version successfully deployed',
    application_name: 'my-app', application_uuid: 'abc123', project: 'shop', environment: 'production',
    fqdn: 'https://shop.example.com',
  },
  'deploy ล้มเหลว': {
    success: false, event: 'deployment_failed', message: 'Deployment failed',
    application_name: 'my-app', application_uuid: 'abc123', project: 'shop', environment: 'production',
    deployment_url: 'https://coolify.example.com/…',
  },
  'backup ล้มเหลว': {
    success: false, event: 'backup_failed', message: 'Database backup failed',
    database_name: 'shop-db', database_uuid: 'ใส่ uuid จริงของ database', database_type: 'postgresql', frequency: '0 0 * * *',
  },
  'server ล่ม': {
    success: false, event: 'server_unreachable', message: 'Server unreachable', server_name: 'main', server_uuid: 'xyz',
  },
}

const fmt = (o: object) => JSON.stringify(o, null, 2)

export default function SimulatePage() {
  const { message } = App.useApp()
  const [sample, setSample] = useState('deploy ล้มเหลว')
  const [body, setBody] = useState(fmt(SAMPLES['deploy ล้มเหลว']))
  const [result, setResult] = useState<SimulateResult>()
  const [busy, setBusy] = useState<'run' | 'send' | null>(null)

  const run = async (send: boolean) => {
    try {
      JSON.parse(body)
    } catch {
      message.error('JSON ไม่ถูกต้อง')
      return
    }
    setBusy(send ? 'send' : 'run')
    try {
      const r = await api<SimulateResult>('/api/simulate' + (send ? '?send=1' : ''), { method: 'POST', body })
      setResult(r)
      if (r.sent) message.success('ส่งเข้าคิวแล้ว ดูผลที่หน้าประวัติ')
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="ทดลองกฎ">
      <Typography.Paragraph type="secondary">วาง payload แบบที่ Coolify ส่ง แล้วดูว่าจะถูกส่งไปที่ไหน</Typography.Paragraph>
      <Flex vertical gap={12}>
        <Segmented
          options={Object.keys(SAMPLES)}
          value={sample}
          onChange={v => {
            setSample(v)
            setBody(fmt(SAMPLES[v]))
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
            ดูว่าจะส่งไปไหน
          </Button>
          <Button icon={<SendOutlined />} loading={busy === 'send'} onClick={() => run(true)}>
            ส่งจริง
          </Button>
        </Flex>

        {result && (
          <>
            {result.destinations.length === 0 ? (
              <Alert type="warning" showIcon title="ไม่ส่งไปไหนเลย" description="ไม่มีกฎที่ตรงและยังไม่ได้ตั้งช่องสำรอง" />
            ) : (
              <Alert
                type={result.fallback ? 'info' : 'success'}
                showIcon
                title={
                  <Flex gap={6} wrap align="center">
                    จะส่งไปที่
                    {result.destinations.map(d => (
                      <Tag key={d} color="purple">
                        {d}
                      </Tag>
                    ))}
                  </Flex>
                }
                description={result.fallback ? 'ไปช่องสำรอง เพราะไม่มีกฎไหนตรง' : undefined}
              />
            )}
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: 'event', label: 'Event', children: <Typography.Text code>{result.event}</Typography.Text> },
                {
                  key: 'project',
                  label: 'โปรเจค',
                  children: result.project || <Typography.Text type="secondary">ไม่ทราบ</Typography.Text>,
                },
                {
                  key: 'env',
                  label: 'Environment',
                  children: result.environment || <Typography.Text type="secondary">—</Typography.Text>,
                },
                {
                  key: 'res',
                  label: 'Resource',
                  children: result.resource || <Typography.Text type="secondary">—</Typography.Text>,
                },
              ]}
            />
          </>
        )}
      </Flex>
    </Card>
  )
}
