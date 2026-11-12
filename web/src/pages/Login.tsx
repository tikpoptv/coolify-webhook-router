import { useState } from 'react'
import { Alert, Button, Card, Flex, Form, Input, Typography, theme } from 'antd'
import { LockOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'

export default function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const { token } = theme.useToken()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      const me = await api<{ user: string }>('/api/login', { method: 'POST', body: values })
      onLogin(me.user)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16, background: token.colorBgLayout }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Flex vertical align="center" gap={4} style={{ marginBottom: 24 }}>
          <SwapOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Webhook Router
          </Typography.Title>
          <Typography.Text type="secondary">กระจายแจ้งเตือน Coolify ไปตามโปรเจค</Typography.Text>
        </Flex>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={submit} initialValues={{ username: 'admin' }} requiredMark={false}>
          <Form.Item name="username" label="ชื่อผู้ใช้" rules={[{ required: true, message: 'กรุณาใส่ชื่อผู้ใช้' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label="รหัสผ่าน" rules={[{ required: true, message: 'กรุณาใส่รหัสผ่าน' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            เข้าสู่ระบบ
          </Button>
        </Form>
      </Card>
    </Flex>
  )
}
