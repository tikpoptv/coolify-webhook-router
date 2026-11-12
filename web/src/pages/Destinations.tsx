import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import type { Destination, DestinationType, Rule } from '../types'
import { TYPE_COLORS, TYPE_LABELS } from '../types'

const HINTS: Record<DestinationType, string> = {
  discord: 'Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL',
  slack: 'Slack: สร้าง Incoming Webhook ใน app ของ workspace (Mattermost ใช้ incoming webhook ได้เหมือนกัน)',
  telegram: 'Telegram: สร้าง bot กับ @BotFather เอา token มาใส่ แล้วเพิ่ม bot เข้ากลุ่ม ใช้ chat ID ของกลุ่ม',
  webhook: 'ส่ง JSON เดิมจาก Coolify ต่อไปยัง URL นี้ (เติม project / environment ให้ถ้าหาได้)',
}

type FormValues = { name: string; type: DestinationType; url: string; chat_id: string }

export default function DestinationsPage() {
  const { message } = App.useApp()
  const [dests, setDests] = useState<Destination[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Destination | 'new' | null>(null)
  const [testing, setTesting] = useState<number | null>(null)

  const load = async () => {
    try {
      const [d, r] = await Promise.all([api<Destination[]>('/api/destinations'), api<Rule[]>('/api/rules')])
      setDests(d)
      setRules(r)
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const test = async (d: Destination) => {
    setTesting(d.id)
    try {
      await api(`/api/destinations/${d.id}/test`, { method: 'POST' })
      message.success(`ส่งไป ${d.name} สำเร็จ`)
    } catch (e) {
      message.error(`ส่งไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setTesting(null)
    }
  }

  const remove = async (d: Destination) => {
    try {
      await api(`/api/destinations/${d.id}`, { method: 'DELETE' })
      message.success('ลบแล้ว')
      load()
    } catch (e) {
      message.error(errorText(e))
    }
  }

  return (
    <Card
      title="ปลายทาง"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
          เพิ่มปลายทาง
        </Button>
      }
    >
      <Table<Destination>
        rowKey="id"
        loading={loading}
        dataSource={dests}
        pagination={false}
        scroll={{ x: 640 }}
        locale={{ emptyText: 'ยังไม่มีปลายทาง — กด "เพิ่มปลายทาง" ได้เลย' }}
        columns={[
          { title: 'ชื่อ', dataIndex: 'name', render: v => <Typography.Text strong>{v}</Typography.Text> },
          { title: 'ประเภท', dataIndex: 'type', render: (t: DestinationType) => <Tag color={TYPE_COLORS[t]}>{TYPE_LABELS[t]}</Tag> },
          {
            title: 'URL / token',
            dataIndex: 'url',
            render: (v, d) => (
              <Flex vertical>
                <Typography.Text type="secondary" className="mono">
                  {v}
                </Typography.Text>
                {d.chat_id && <Typography.Text type="secondary">chat {d.chat_id}</Typography.Text>}
              </Flex>
            ),
          },
          {
            title: 'กฎ',
            width: 70,
            render: (_, d) => rules.filter(r => r.destination_id === d.id).length,
          },
          {
            key: 'actions',
            align: 'right',
            width: 210,
            render: (_, d) => {
              const n = rules.filter(r => r.destination_id === d.id).length
              return (
                <Flex gap={4} justify="end">
                  <Button size="small" icon={<SendOutlined />} loading={testing === d.id} onClick={() => test(d)}>
                    ส่งทดสอบ
                  </Button>
                  <Tooltip title="แก้ไข">
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(d)} />
                  </Tooltip>
                  <Popconfirm
                    title={`ลบ "${d.name}"?`}
                    description={n ? `กฎที่ส่งไปที่นี่ ${n} กฎจะถูกลบด้วย` : undefined}
                    okText="ลบ"
                    okButtonProps={{ danger: true }}
                    cancelText="ยกเลิก"
                    onConfirm={() => remove(d)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Flex>
              )
            },
          },
        ]}
      />
      {editing && (
        <DestinationModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </Card>
  )
}

function DestinationModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Destination | null
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const type = Form.useWatch('type', form) ?? initial?.type ?? 'discord'
  const [saving, setSaving] = useState(false)
  const isTelegram = type === 'telegram'

  const submit = async (values: FormValues) => {
    setSaving(true)
    try {
      await api(initial ? `/api/destinations/${initial.id}` : '/api/destinations', {
        method: initial ? 'PUT' : 'POST',
        body: { ...values, chat_id: values.chat_id ?? '' },
      })
      message.success(initial ? 'แก้ไขแล้ว' : 'เพิ่มแล้ว — ลองกด "ส่งทดสอบ"')
      onSaved()
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={initial ? `แก้ไข ${initial.name}` : 'เพิ่มปลายทาง'}
      okText={initial ? 'บันทึก' : 'เพิ่ม'}
      cancelText="ยกเลิก"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
        initialValues={initial ? { name: initial.name, type: initial.type, chat_id: initial.chat_id, url: '' } : { type: 'discord' }}
      >
        <Form.Item name="name" label="ชื่อ" rules={[{ required: true, message: 'กรุณาใส่ชื่อ' }]}>
          <Input placeholder="เช่น discord-shop-prod" />
        </Form.Item>
        <Form.Item name="type" label="ประเภท">
          <Select options={(Object.keys(TYPE_LABELS) as DestinationType[]).map(t => ({ value: t, label: TYPE_LABELS[t] }))} />
        </Form.Item>
        <Alert type="info" title={HINTS[type]} style={{ marginBottom: 16 }} />
        <Form.Item
          name="url"
          label={isTelegram ? 'Bot token' : 'Webhook URL'}
          extra={initial ? 'เว้นว่างเพื่อใช้ค่าเดิม' : undefined}
          rules={[
            { required: !initial, message: isTelegram ? 'กรุณาใส่ bot token' : 'กรุณาใส่ URL' },
            ...(isTelegram ? [] : [{ pattern: /^https?:\/\//, message: 'ต้องขึ้นต้นด้วย http:// หรือ https://' }]),
          ]}
        >
          <Input.Password
            visibilityToggle
            autoComplete="off"
            placeholder={initial ? '••••••' : isTelegram ? '123456:ABC-DEF…' : 'https://…'}
          />
        </Form.Item>
        {isTelegram && (
          <Form.Item name="chat_id" label="Chat ID" rules={[{ required: true, message: 'กรุณาใส่ chat ID' }]}>
            <Input placeholder="-1001234567890" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
