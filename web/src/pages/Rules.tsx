import { useEffect, useMemo, useState } from 'react'
import { Alert, App, AutoComplete, Button, Card, Col, Flex, Form, Modal, Popconfirm, Row, Select, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n, type T } from '../i18n'
import type { Destination, ProjectInfo, Rule } from '../types'
import { EVENTS, TYPE_LABELS } from '../types'

const statusTag = (s: Rule['status'], t: T) =>
  s === 'failure' ? (
    <Tag color="error">{t('common.failure')}</Tag>
  ) : s === 'success' ? (
    <Tag color="success">{t('common.success')}</Tag>
  ) : (
    <Tag>{t('common.all')}</Tag>
  )

export default function RulesPage() {
  const { message } = App.useApp()
  const { t } = useI18n()
  const [rules, setRules] = useState<Rule[]>([])
  const [dests, setDests] = useState<Destination[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)

  const pattern = (v: string) => (v ? <Typography.Text code>{v}</Typography.Text> : <Tag>{t('common.all')}</Tag>)

  const load = async () => {
    try {
      const [r, d, p] = await Promise.all([
        api<Rule[]>('/api/rules'),
        api<Destination[]>('/api/destinations'),
        api<ProjectInfo[]>('/api/projects'),
      ])
      setRules(r)
      setDests(d)
      setProjects(p)
    } catch (e) {
      message.error(errorText(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules(rs => rs.map(r => (r.id === rule.id ? { ...r, enabled } : r)))
    try {
      await api(`/api/rules/${rule.id}`, { method: 'PUT', body: { ...rule, enabled } })
    } catch (e) {
      message.error(errorText(e))
      load()
    }
  }

  const remove = async (rule: Rule) => {
    try {
      await api(`/api/rules/${rule.id}`, { method: 'DELETE' })
      message.success(t('common.deleted'))
      load()
    } catch (e) {
      message.error(errorText(e))
    }
  }

  return (
    <Card
      title={t('rules.title')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} disabled={!dests.length} onClick={() => setEditing('new')}>
          {t('rules.add')}
        </Button>
      }
    >
      {!loading && !dests.length && <Alert type="warning" showIcon title={t('rules.needDest')} style={{ marginBottom: 16 }} />}
      <Typography.Paragraph type="secondary">{t('rules.help')}</Typography.Paragraph>
      <Table<Rule>
        rowKey="id"
        loading={loading}
        dataSource={rules}
        pagination={false}
        scroll={{ x: 720 }}
        locale={{ emptyText: t('rules.empty') }}
        rowClassName={r => (r.enabled ? '' : 'rule-disabled')}
        columns={[
          {
            title: t('rules.col.enabled'),
            dataIndex: 'enabled',
            width: 70,
            render: (v: boolean, r) => <Switch size="small" checked={v} onChange={c => toggle(r, c)} />,
          },
          { title: t('common.project'), dataIndex: 'project', render: pattern },
          { title: t('common.environment'), dataIndex: 'environment', render: pattern },
          { title: t('common.event'), dataIndex: 'event', render: pattern },
          { title: t('common.status'), dataIndex: 'status', render: (s: Rule['status']) => statusTag(s, t) },
          {
            title: t('common.sendTo'),
            dataIndex: 'destination_name',
            render: v => <Typography.Text strong>→ {v}</Typography.Text>,
          },
          {
            key: 'actions',
            align: 'right',
            width: 100,
            render: (_, r) => (
              <Flex gap={4} justify="end">
                <Tooltip title={t('common.edit')}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                </Tooltip>
                <Popconfirm
                  title={t('rules.confirmDelete')}
                  okText={t('common.delete')}
                  okButtonProps={{ danger: true }}
                  cancelText={t('common.cancel')}
                  onConfirm={() => remove(r)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Flex>
            ),
          },
        ]}
      />
      {editing && (
        <RuleModal
          initial={editing === 'new' ? null : editing}
          dests={dests}
          projects={projects}
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

type FormValues = Pick<Rule, 'project' | 'environment' | 'event' | 'status' | 'destination_id'>

function RuleModal({
  initial,
  dests,
  projects,
  onClose,
  onSaved,
}: {
  initial: Rule | null
  dests: Destination[]
  projects: ProjectInfo[]
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const { t } = useI18n()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const project = Form.useWatch('project', form)

  const envOptions = useMemo(() => {
    const p = projects.find(p => p.name === project)
    const envs = p ? p.environments : [...new Set(projects.flatMap(p => p.environments))]
    return envs.map(e => ({ value: e }))
  }, [projects, project])

  const filter = (input: string, option?: { value: string }) => !!option?.value.toLowerCase().includes(input.toLowerCase())

  const submit = async (values: FormValues) => {
    setSaving(true)
    const body = {
      project: values.project ?? '',
      environment: values.environment ?? '',
      event: values.event ?? '',
      status: values.status ?? '',
      destination_id: values.destination_id,
      enabled: initial ? initial.enabled : true,
    }
    try {
      await api(initial ? `/api/rules/${initial.id}` : '/api/rules', { method: initial ? 'PUT' : 'POST', body })
      message.success(initial ? t('common.updated') : t('rules.added'))
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
      width={640}
      title={initial ? t('rules.editTitle') : t('rules.add')}
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
        initialValues={initial ? { ...initial } : { project: '', environment: '', event: '', status: '', destination_id: dests[0]?.id }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="project" label={t('common.project')} extra={projects.length ? undefined : t('rules.connectHint')}>
              <AutoComplete
                allowClear
                placeholder={t('rules.anyProject')}
                options={projects.map(p => ({ value: p.name }))}
                filterOption={filter}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="environment" label={t('common.environment')}>
              <AutoComplete allowClear placeholder={t('rules.anyEnv')} options={envOptions} filterOption={filter} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="event" label={t('common.event')}>
              <AutoComplete
                allowClear
                placeholder={t('rules.anyEvent')}
                options={EVENTS.map(e => ({ value: e }))}
                filterOption={filter}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="status" label={t('common.status')}>
              <Select
                options={[
                  { value: '', label: t('common.all') },
                  { value: 'failure', label: t('rules.status.failure') },
                  { value: 'success', label: t('rules.status.success') },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="destination_id" label={t('common.sendTo')} rules={[{ required: true, message: t('rules.destRequired') }]}>
              <Select options={dests.map(d => ({ value: d.id, label: `${d.name} · ${TYPE_LABELS[d.type]}` }))} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
