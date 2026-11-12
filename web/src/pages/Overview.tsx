import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Col, Flex, Form, Input, Row, Select, Skeleton, Statistic, Typography } from 'antd'
import { ApiOutlined, LinkOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import type { Destination, Overview } from '../types'
import { TYPE_LABELS } from '../types'

export default function OverviewPage() {
  const { message } = App.useApp()
  const [ov, setOv] = useState<Overview>()
  const [dests, setDests] = useState<Destination[]>([])
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [form] = Form.useForm()

  const apply = (o: Overview) => {
    setOv(o)
    form.setFieldsValue({ coolify_url: o.coolify_url, coolify_api_token: '' })
  }

  useEffect(() => {
    Promise.all([api<Overview>('/api/overview'), api<Destination[]>('/api/destinations')])
      .then(([o, d]) => {
        apply(o)
        setDests(d)
      })
      .catch(e => message.error(errorText(e)))
  }, [])

  if (!ov) return <Skeleton active />

  const hookUrl = window.location.origin + ov.hook_path

  const saveCoolify = async (values: { coolify_url: string; coolify_api_token: string }) => {
    setSaving(true)
    try {
      const o = await api<Overview>('/api/settings', { method: 'PUT', body: values })
      apply(o)
      if (o.coolify.error) message.warning('บันทึกแล้ว แต่เชื่อมต่อ Coolify ไม่สำเร็จ')
      else message.success('บันทึกแล้ว')
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
      message.success('บันทึกช่องสำรองแล้ว')
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
            <LinkOutlined /> 1. ใส่ URL นี้ใน Coolify
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          Coolify → Notifications → Webhook → <b>Webhook URL</b> แล้วกด Enable และเลือก event ทั้งหมดได้เลย router จะคัดให้เอง
        </Typography.Paragraph>
        <Typography.Paragraph
          copyable={{ text: hookUrl, tooltips: ['คัดลอก', 'คัดลอกแล้ว'] }}
          code
          style={{ marginBottom: 0, wordBreak: 'break-all' }}
        >
          {hookUrl}
        </Typography.Paragraph>
      </Card>

      <Card
        title={
          <Flex gap={8}>
            <ApiOutlined /> 2. เชื่อมต่อ Coolify API
          </Flex>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={refreshing} disabled={!c.configured}>
            โหลดใหม่
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          ใช้หาว่า backup, scheduled task และ image scan เป็นของโปรเจคไหน (event deploy มีชื่อโปรเจคมาอยู่แล้ว) — สร้าง
          token ที่ Coolify → Keys &amp; Tokens → API tokens สิทธิ์ <b>read</b> ก็พอ
        </Typography.Paragraph>

        {!c.configured ? (
          <Alert
            type="info"
            showIcon
            title="ยังไม่ได้เชื่อมต่อ"
            description="ใช้งานได้ แต่ event ที่ไม่มีชื่อโปรเจค (backup, task) จะไปลงช่องสำรอง"
            style={{ marginBottom: 16 }}
          />
        ) : c.error ? (
          <Alert type="error" showIcon title="เชื่อมต่อไม่ได้" description={c.error} style={{ marginBottom: 16 }} />
        ) : (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={8}>
              <Statistic title="โปรเจค" value={c.projects} />
            </Col>
            <Col xs={8}>
              <Statistic title="Resource" value={c.resources} />
            </Col>
            <Col xs={8}>
              <Statistic
                title="อัปเดตล่าสุด"
                value={new Date(c.loaded_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              />
            </Col>
          </Row>
        )}

        <Form form={form} layout="vertical" onFinish={saveCoolify} requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="coolify_url"
                label="Coolify URL"
                rules={[{ pattern: /^https?:\/\//, message: 'ต้องขึ้นต้นด้วย http:// หรือ https://' }]}
              >
                <Input placeholder="https://coolify.example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="coolify_api_token" label="API token">
                <Input.Password
                  autoComplete="off"
                  placeholder={ov.coolify_token_set ? 'ตั้งไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม' : 'วาง token'}
                />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving}>
            บันทึก
          </Button>
        </Form>
      </Card>

      <Card
        title={
          <Flex gap={8}>
            <SafetyOutlined /> 3. ช่องสำรอง
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          ถ้า event ไม่ตรงกับกฎไหนเลย (เช่น event ของ server หรือข้อความทดสอบจาก Coolify) จะส่งมาที่นี่
        </Typography.Paragraph>
        <Select
          style={{ width: '100%', maxWidth: 420 }}
          value={ov.fallback_destination_id || 0}
          onChange={saveFallback}
          options={[
            { value: 0, label: '— ไม่ส่ง (ทิ้ง) —' },
            ...dests.map(d => ({ value: d.id, label: `${d.name} · ${TYPE_LABELS[d.type]}` })),
          ]}
          notFoundContent="เพิ่มปลายทางก่อน"
        />
      </Card>
    </Flex>
  )
}
