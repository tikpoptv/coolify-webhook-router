import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, App, AutoComplete, Button, Card, Col, Flex, Form, Modal, Popconfirm, Row, Select, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import type { Destination, ProjectInfo, Rule } from '../types'
import { EVENTS, TYPE_LABELS } from '../types'

const anyTag = <Tag>ทั้งหมด</Tag>
const pattern = (v: string) => (v ? <Typography.Text code>{v}</Typography.Text> : anyTag)

const STATUS_TAG: Record<Rule['status'], ReactNode> = {
  '': anyTag,
  failure: <Tag color="error">ล้มเหลว</Tag>,
  success: <Tag color="success">สำเร็จ</Tag>,
}

export default function RulesPage() {
  const { message } = App.useApp()
  const [rules, setRules] = useState<Rule[]>([])
  const [dests, setDests] = useState<Destination[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)

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

  const save = async (rule: Rule) => {
    await api(`/api/rules/${rule.id}`, { method: 'PUT', body: rule })
  }

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules(rs => rs.map(r => (r.id === rule.id ? { ...r, enabled } : r)))
    try {
      await save({ ...rule, enabled })
    } catch (e) {
      message.error(errorText(e))
      load()
    }
  }

  const remove = async (rule: Rule) => {
    try {
      await api(`/api/rules/${rule.id}`, { method: 'DELETE' })
      message.success('ลบแล้ว')
      load()
    } catch (e) {
      message.error(errorText(e))
    }
  }

  return (
    <Card
      title="กฎการส่ง"
      extra={
        <Button type="primary" icon={<PlusOutlined />} disabled={!dests.length} onClick={() => setEditing('new')}>
          เพิ่มกฎ
        </Button>
      }
    >
      {!loading && !dests.length && (
        <Alert type="warning" showIcon title="ต้องเพิ่มปลายทางก่อน ถึงจะสร้างกฎได้" style={{ marginBottom: 16 }} />
      )}
      <Typography.Paragraph type="secondary">
        เว้นว่าง = ทุกค่า · ใช้ <Typography.Text code>*</Typography.Text> ได้ เช่น{' '}
        <Typography.Text code>backup_*</Typography.Text> · event หนึ่งตรงได้หลายกฎ จะส่งไปทุกปลายทางที่ตรง (ไม่ส่งซ้ำ) ·
        ไม่ตรงกฎไหนเลยจะไปช่องสำรอง
      </Typography.Paragraph>
      <Table<Rule>
        rowKey="id"
        loading={loading}
        dataSource={rules}
        pagination={false}
        scroll={{ x: 720 }}
        locale={{ emptyText: 'ยังไม่มีกฎ — ทุก event จะไปที่ช่องสำรอง' }}
        columns={[
          {
            title: 'เปิด',
            dataIndex: 'enabled',
            width: 70,
            render: (v: boolean, r) => <Switch size="small" checked={v} onChange={c => toggle(r, c)} />,
          },
          { title: 'โปรเจค', dataIndex: 'project', render: pattern },
          { title: 'Environment', dataIndex: 'environment', render: pattern },
          { title: 'Event', dataIndex: 'event', render: pattern },
          { title: 'สถานะ', dataIndex: 'status', render: (s: Rule['status']) => STATUS_TAG[s] },
          {
            title: 'ส่งไปที่',
            dataIndex: 'destination_name',
            render: v => <Typography.Text strong>→ {v}</Typography.Text>,
          },
          {
            key: 'actions',
            align: 'right',
            width: 100,
            render: (_, r) => (
              <Flex gap={4} justify="end">
                <Tooltip title="แก้ไข">
                  <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)} />
                </Tooltip>
                <Popconfirm
                  title="ลบกฎนี้?"
                  okText="ลบ"
                  okButtonProps={{ danger: true }}
                  cancelText="ยกเลิก"
                  onConfirm={() => remove(r)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Flex>
            ),
          },
        ]}
        rowClassName={r => (r.enabled ? '' : 'rule-disabled')}
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
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const project = Form.useWatch('project', form)

  const envOptions = useMemo(() => {
    const p = projects.find(p => p.name === project)
    const envs = p ? p.environments : [...new Set(projects.flatMap(p => p.environments))]
    return envs.map(e => ({ value: e }))
  }, [projects, project])

  const filter = (input: string, option?: { value: string }) =>
    !!option?.value.toLowerCase().includes(input.toLowerCase())

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
      message.success(initial ? 'แก้ไขแล้ว' : 'เพิ่มกฎแล้ว — มีผลทันที')
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
      title={initial ? 'แก้ไขกฎ' : 'เพิ่มกฎ'}
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
        initialValues={
          initial
            ? { ...initial }
            : { project: '', environment: '', event: '', status: '', destination_id: dests[0]?.id }
        }
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="project" label="โปรเจค" extra={projects.length ? undefined : 'เชื่อม Coolify API เพื่อให้มีรายชื่อให้เลือก'}>
              <AutoComplete
                allowClear
                placeholder="ทุกโปรเจค"
                options={projects.map(p => ({ value: p.name }))}
                filterOption={filter}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="environment" label="Environment">
              <AutoComplete allowClear placeholder="ทุก environment" options={envOptions} filterOption={filter} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="event" label="Event">
              <AutoComplete
                allowClear
                placeholder="ทุก event"
                options={EVENTS.map(e => ({ value: e }))}
                filterOption={filter}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="status" label="สถานะ">
              <Select
                options={[
                  { value: '', label: 'ทั้งหมด' },
                  { value: 'failure', label: 'เฉพาะที่ล้มเหลว / แจ้งเตือน' },
                  { value: 'success', label: 'เฉพาะที่สำเร็จ' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="destination_id" label="ส่งไปที่" rules={[{ required: true, message: 'เลือกปลายทาง' }]}>
              <Select options={dests.map(d => ({ value: d.id, label: `${d.name} · ${TYPE_LABELS[d.type]}` }))} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
