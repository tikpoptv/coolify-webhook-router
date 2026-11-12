import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n, type MessageKey } from '../i18n'
import type { Destination, DestinationType, Rule } from '../types'
import { TYPE_COLORS, TYPE_LABELS } from '../types'

type FormValues = { name: string; type: DestinationType; url: string; chat_id: string }

export default function DestinationsPage() {
  const { message } = App.useApp()
  const { t } = useI18n()
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

  const ruleCount = (d: Destination) => rules.filter(r => r.destination_id === d.id).length

  const test = async (d: Destination) => {
    setTesting(d.id)
    try {
      await api(`/api/destinations/${d.id}/test`, { method: 'POST' })
      message.success(t('dest.testOk', { name: d.name }))
    } catch (e) {
      message.error(t('dest.testFail', { error: errorText(e) }))
    } finally {
      setTesting(null)
    }
  }

  const remove = async (d: Destination) => {
    try {
      await api(`/api/destinations/${d.id}`, { method: 'DELETE' })
      message.success(t('common.deleted'))
      load()
    } catch (e) {
      message.error(errorText(e))
    }
  }

  return (
    <Card
      title={t('dest.title')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
          {t('dest.add')}
        </Button>
      }
    >
      <Table<Destination>
        rowKey="id"
        loading={loading}
        dataSource={dests}
        pagination={false}
        scroll={{ x: 640 }}
        locale={{ emptyText: t('dest.empty') }}
        columns={[
          { title: t('dest.col.name'), dataIndex: 'name', render: v => <Typography.Text strong>{v}</Typography.Text> },
          {
            title: t('dest.col.type'),
            dataIndex: 'type',
            render: (type: DestinationType) => <Tag color={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Tag>,
          },
          {
            title: t('dest.col.url'),
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
          { title: t('dest.col.rules'), width: 80, render: (_, d) => ruleCount(d) },
          {
            key: 'actions',
            align: 'right',
            width: 230,
            render: (_, d) => {
              const n = ruleCount(d)
              return (
                <Flex gap={4} justify="end">
                  <Button size="small" icon={<SendOutlined />} loading={testing === d.id} onClick={() => test(d)}>
                    {t('dest.test')}
                  </Button>
                  <Tooltip title={t('common.edit')}>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(d)} />
                  </Tooltip>
                  <Popconfirm
                    title={t('dest.confirmDelete', { name: d.name })}
                    description={n ? t('dest.confirmDeleteRules', { n }) : undefined}
                    okText={t('common.delete')}
                    okButtonProps={{ danger: true }}
                    cancelText={t('common.cancel')}
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
  const { t } = useI18n()
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
      message.success(initial ? t('common.updated') : t('dest.added'))
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
      title={initial ? t('dest.editTitle', { name: initial.name }) : t('dest.add')}
      okText={initial ? t('common.save') : t('common.add')}
      cancelText={t('common.cancel')}
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
        <Form.Item name="name" label={t('dest.name')} rules={[{ required: true, message: t('dest.nameRequired') }]}>
          <Input placeholder={t('dest.namePlaceholder')} />
        </Form.Item>
        <Form.Item name="type" label={t('dest.type')}>
          <Select options={(Object.keys(TYPE_LABELS) as DestinationType[]).map(v => ({ value: v, label: TYPE_LABELS[v] }))} />
        </Form.Item>
        <Alert type="info" title={t(`dest.hint.${type}` as MessageKey)} style={{ marginBottom: 16 }} />
        <Form.Item
          name="url"
          label={isTelegram ? t('dest.botToken') : t('dest.webhookUrl')}
          extra={initial ? t('dest.keepBlank') : undefined}
          rules={[
            { required: !initial, message: isTelegram ? t('dest.tokenRequired') : t('dest.urlRequired') },
            ...(isTelegram ? [] : [{ pattern: /^https?:\/\//, message: t('common.urlScheme') }]),
          ]}
        >
          <Input.Password
            autoComplete="off"
            placeholder={initial ? '••••••' : isTelegram ? '123456:ABC-DEF…' : 'https://…'}
          />
        </Form.Item>
        {isTelegram && (
          <Form.Item name="chat_id" label={t('dest.chatId')} rules={[{ required: true, message: t('dest.chatIdRequired') }]}>
            <Input placeholder="-1001234567890" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
