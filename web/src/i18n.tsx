import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { setApiLang } from './api'

export type Lang = 'th' | 'en'

const th = {
  // nav / shell
  'nav.overview': 'ภาพรวม',
  'nav.destinations': 'ปลายทาง',
  'nav.rules': 'กฎ',
  'nav.history': 'ประวัติ',
  'nav.simulate': 'ทดลอง',
  'shell.signedInAs': 'เข้าสู่ระบบเป็น {user}',
  'shell.logout': 'ออกจากระบบ',
  'shell.loggedOut': 'ออกจากระบบแล้ว',

  // login
  'login.tagline': 'กระจายแจ้งเตือน Coolify ไปตามโปรเจค',
  'login.username': 'ชื่อผู้ใช้',
  'login.password': 'รหัสผ่าน',
  'login.usernameRequired': 'กรุณาใส่ชื่อผู้ใช้',
  'login.passwordRequired': 'กรุณาใส่รหัสผ่าน',
  'login.submit': 'เข้าสู่ระบบ',

  // common
  'common.save': 'บันทึก',
  'common.saved': 'บันทึกแล้ว',
  'common.add': 'เพิ่ม',
  'common.cancel': 'ยกเลิก',
  'common.delete': 'ลบ',
  'common.deleted': 'ลบแล้ว',
  'common.edit': 'แก้ไข',
  'common.updated': 'แก้ไขแล้ว',
  'common.reload': 'โหลดใหม่',
  'common.refresh': 'รีเฟรช',
  'common.all': 'ทั้งหมด',
  'common.success': 'สำเร็จ',
  'common.failure': 'ล้มเหลว',
  'common.project': 'โปรเจค',
  'common.environment': 'Environment',
  'common.event': 'Event',
  'common.resource': 'Resource',
  'common.status': 'สถานะ',
  'common.sendTo': 'ส่งไปที่',
  'common.unknown': 'ไม่ทราบ',
  'common.urlScheme': 'ต้องขึ้นต้นด้วย http:// หรือ https://',

  // overview
  'overview.hook.title': '1. ใส่ URL นี้ใน Coolify',
  'overview.hook.help': 'Coolify → Notifications → Webhook → Webhook URL แล้วกด Enable และเลือก event ทั้งหมดได้เลย router จะคัดให้เอง',
  'overview.copy': 'คัดลอก',
  'overview.copied': 'คัดลอกแล้ว',
  'overview.coolify.title': '2. เชื่อมต่อ Coolify API',
  'overview.coolify.help': 'ใช้หาว่า backup, scheduled task และ image scan เป็นของโปรเจคไหน (event deploy มีชื่อโปรเจคมาอยู่แล้ว) — สร้าง token ที่ Coolify → Keys & Tokens → API tokens สิทธิ์ read ก็พอ',
  'overview.coolify.notConfigured': 'ยังไม่ได้เชื่อมต่อ',
  'overview.coolify.notConfiguredDesc': 'ใช้งานได้ แต่ event ที่ไม่มีชื่อโปรเจค (backup, task) จะไปลงช่องสำรอง',
  'overview.coolify.error': 'เชื่อมต่อไม่ได้',
  'overview.coolify.projects': 'โปรเจค',
  'overview.coolify.resources': 'Resource',
  'overview.coolify.updated': 'อัปเดตล่าสุด',
  'overview.coolify.url': 'Coolify URL',
  'overview.coolify.token': 'API token',
  'overview.coolify.tokenSet': 'ตั้งไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม',
  'overview.coolify.tokenPaste': 'วาง token',
  'overview.coolify.savedButFailed': 'บันทึกแล้ว แต่เชื่อมต่อ Coolify ไม่สำเร็จ',
  'overview.fallback.title': '3. ช่องสำรอง',
  'overview.fallback.help': 'ถ้า event ไม่ตรงกับกฎไหนเลย (เช่น event ของ server หรือข้อความทดสอบจาก Coolify) จะส่งมาที่นี่',
  'overview.fallback.none': '— ไม่ส่ง (ทิ้ง) —',
  'overview.fallback.empty': 'เพิ่มปลายทางก่อน',
  'overview.fallback.saved': 'บันทึกช่องสำรองแล้ว',

  // destinations
  'dest.title': 'ปลายทาง',
  'dest.add': 'เพิ่มปลายทาง',
  'dest.empty': 'ยังไม่มีปลายทาง — กด "เพิ่มปลายทาง" ได้เลย',
  'dest.col.name': 'ชื่อ',
  'dest.col.type': 'ประเภท',
  'dest.col.url': 'URL / token',
  'dest.col.rules': 'กฎ',
  'dest.test': 'ส่งทดสอบ',
  'dest.testOk': 'ส่งไป {name} สำเร็จ',
  'dest.testFail': 'ส่งไม่สำเร็จ: {error}',
  'dest.confirmDelete': 'ลบ "{name}"?',
  'dest.confirmDeleteRules': 'กฎที่ส่งไปที่นี่ {n} กฎจะถูกลบด้วย',
  'dest.editTitle': 'แก้ไข {name}',
  'dest.added': 'เพิ่มแล้ว — ลองกด "ส่งทดสอบ"',
  'dest.name': 'ชื่อ',
  'dest.namePlaceholder': 'เช่น discord-shop-prod',
  'dest.nameRequired': 'กรุณาใส่ชื่อ',
  'dest.type': 'ประเภท',
  'dest.botToken': 'Bot token',
  'dest.webhookUrl': 'Webhook URL',
  'dest.keepBlank': 'เว้นว่างเพื่อใช้ค่าเดิม',
  'dest.tokenRequired': 'กรุณาใส่ bot token',
  'dest.urlRequired': 'กรุณาใส่ URL',
  'dest.chatId': 'Chat ID',
  'dest.chatIdRequired': 'กรุณาใส่ chat ID',
  'dest.hint.discord': 'Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL',
  'dest.hint.slack': 'Slack: สร้าง Incoming Webhook ใน app ของ workspace (Mattermost ใช้ incoming webhook ได้เหมือนกัน)',
  'dest.hint.telegram': 'Telegram: สร้าง bot กับ @BotFather เอา token มาใส่ แล้วเพิ่ม bot เข้ากลุ่ม ใช้ chat ID ของกลุ่ม',
  'dest.hint.webhook': 'ส่ง JSON เดิมจาก Coolify ต่อไปยัง URL นี้ (เติม project / environment ให้ถ้าหาได้)',

  // rules
  'rules.title': 'กฎการส่ง',
  'rules.add': 'เพิ่มกฎ',
  'rules.needDest': 'ต้องเพิ่มปลายทางก่อน ถึงจะสร้างกฎได้',
  'rules.help': 'เว้นว่าง = ทุกค่า · ใช้ * ได้ เช่น backup_* · event หนึ่งตรงได้หลายกฎ จะส่งไปทุกปลายทางที่ตรง (ไม่ส่งซ้ำ) · ไม่ตรงกฎไหนเลยจะไปช่องสำรอง',
  'rules.empty': 'ยังไม่มีกฎ — ทุก event จะไปที่ช่องสำรอง',
  'rules.col.enabled': 'เปิด',
  'rules.confirmDelete': 'ลบกฎนี้?',
  'rules.editTitle': 'แก้ไขกฎ',
  'rules.added': 'เพิ่มกฎแล้ว — มีผลทันที',
  'rules.anyProject': 'ทุกโปรเจค',
  'rules.anyEnv': 'ทุก environment',
  'rules.anyEvent': 'ทุก event',
  'rules.connectHint': 'เชื่อม Coolify API เพื่อให้มีรายชื่อให้เลือก',
  'rules.status.failure': 'เฉพาะที่ล้มเหลว / แจ้งเตือน',
  'rules.status.success': 'เฉพาะที่สำเร็จ',
  'rules.destRequired': 'เลือกปลายทาง',

  // history
  'history.title': 'ประวัติล่าสุด',
  'history.failed': 'ไม่สำเร็จ {n}',
  'history.auto': 'อัปเดตอัตโนมัติ',
  'history.empty': 'ยังไม่มี event เข้ามา — ลองกด "Send test" ใน Coolify',
  'history.col.time': 'เวลา',
  'history.noRoute': 'ไม่มีกฎที่ตรง และยังไม่ได้ตั้งช่องสำรอง',

  // simulate
  'sim.title': 'ทดลองกฎ',
  'sim.help': 'วาง payload แบบที่ Coolify ส่ง แล้วดูว่าจะถูกส่งไปที่ไหน',
  'sim.sample.deployOk': 'deploy สำเร็จ',
  'sim.sample.deployFail': 'deploy ล้มเหลว',
  'sim.sample.backupFail': 'backup ล้มเหลว',
  'sim.sample.serverDown': 'server ล่ม',
  'sim.run': 'ดูว่าจะส่งไปไหน',
  'sim.send': 'ส่งจริง',
  'sim.invalidJson': 'JSON ไม่ถูกต้อง',
  'sim.queued': 'ส่งเข้าคิวแล้ว ดูผลที่หน้าประวัติ',
  'sim.nowhere': 'ไม่ส่งไปไหนเลย',
  'sim.nowhereDesc': 'ไม่มีกฎที่ตรงและยังไม่ได้ตั้งช่องสำรอง',
  'sim.willSend': 'จะส่งไปที่',
  'sim.viaFallback': 'ไปช่องสำรอง เพราะไม่มีกฎไหนตรง',
  'sim.uuidPlaceholder': 'ใส่ uuid จริงของ database',
}

export type MessageKey = keyof typeof th

const en: Record<MessageKey, string> = {
  'nav.overview': 'Overview',
  'nav.destinations': 'Destinations',
  'nav.rules': 'Rules',
  'nav.history': 'History',
  'nav.simulate': 'Try it',
  'shell.signedInAs': 'Signed in as {user}',
  'shell.logout': 'Sign out',
  'shell.loggedOut': 'Signed out',

  'login.tagline': 'Route Coolify notifications by project',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.usernameRequired': 'Enter your username',
  'login.passwordRequired': 'Enter your password',
  'login.submit': 'Sign in',

  'common.save': 'Save',
  'common.saved': 'Saved',
  'common.add': 'Add',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.deleted': 'Deleted',
  'common.edit': 'Edit',
  'common.updated': 'Updated',
  'common.reload': 'Reload',
  'common.refresh': 'Refresh',
  'common.all': 'Any',
  'common.success': 'Success',
  'common.failure': 'Failure',
  'common.project': 'Project',
  'common.environment': 'Environment',
  'common.event': 'Event',
  'common.resource': 'Resource',
  'common.status': 'Status',
  'common.sendTo': 'Send to',
  'common.unknown': 'Unknown',
  'common.urlScheme': 'Must start with http:// or https://',

  'overview.hook.title': '1. Add this URL to Coolify',
  'overview.hook.help': 'Coolify → Notifications → Webhook → Webhook URL, then Enable and select all events — the router does the filtering.',
  'overview.copy': 'Copy',
  'overview.copied': 'Copied',
  'overview.coolify.title': '2. Connect the Coolify API',
  'overview.coolify.help': 'Used to find which project a backup, scheduled task or image scan belongs to (deploy events already include the project). Create a token in Coolify → Keys & Tokens → API tokens; read access is enough.',
  'overview.coolify.notConfigured': 'Not connected',
  'overview.coolify.notConfiguredDesc': 'Routing still works, but events without a project name (backups, tasks) go to the fallback.',
  'overview.coolify.error': 'Connection failed',
  'overview.coolify.projects': 'Projects',
  'overview.coolify.resources': 'Resources',
  'overview.coolify.updated': 'Last updated',
  'overview.coolify.url': 'Coolify URL',
  'overview.coolify.token': 'API token',
  'overview.coolify.tokenSet': 'Already set — leave blank to keep it',
  'overview.coolify.tokenPaste': 'Paste token',
  'overview.coolify.savedButFailed': 'Saved, but could not connect to Coolify',
  'overview.fallback.title': '3. Fallback destination',
  'overview.fallback.help': 'Events that match no rule (e.g. server events or Coolify test messages) are sent here.',
  'overview.fallback.none': '— Drop them —',
  'overview.fallback.empty': 'Add a destination first',
  'overview.fallback.saved': 'Fallback saved',

  'dest.title': 'Destinations',
  'dest.add': 'Add destination',
  'dest.empty': 'No destinations yet — click "Add destination".',
  'dest.col.name': 'Name',
  'dest.col.type': 'Type',
  'dest.col.url': 'URL / token',
  'dest.col.rules': 'Rules',
  'dest.test': 'Send test',
  'dest.testOk': 'Sent to {name}',
  'dest.testFail': 'Send failed: {error}',
  'dest.confirmDelete': 'Delete "{name}"?',
  'dest.confirmDeleteRules': '{n} rule(s) sending here will also be deleted.',
  'dest.editTitle': 'Edit {name}',
  'dest.added': 'Added — try "Send test"',
  'dest.name': 'Name',
  'dest.namePlaceholder': 'e.g. discord-shop-prod',
  'dest.nameRequired': 'Enter a name',
  'dest.type': 'Type',
  'dest.botToken': 'Bot token',
  'dest.webhookUrl': 'Webhook URL',
  'dest.keepBlank': 'Leave blank to keep the current value',
  'dest.tokenRequired': 'Enter the bot token',
  'dest.urlRequired': 'Enter the URL',
  'dest.chatId': 'Chat ID',
  'dest.chatIdRequired': 'Enter the chat ID',
  'dest.hint.discord': 'Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL',
  'dest.hint.slack': 'Slack: create an Incoming Webhook in a workspace app (Mattermost incoming webhooks work too)',
  'dest.hint.telegram': 'Telegram: create a bot with @BotFather, paste its token, add the bot to a group and use the group chat ID',
  'dest.hint.webhook': 'Forwards the original Coolify JSON to this URL (with project / environment filled in when known)',

  'rules.title': 'Routing rules',
  'rules.add': 'Add rule',
  'rules.needDest': 'Add a destination before creating rules',
  'rules.help': 'Blank = any · * wildcards work, e.g. backup_* · an event can match several rules and goes to every matching destination (once) · events matching nothing go to the fallback',
  'rules.empty': 'No rules yet — every event goes to the fallback.',
  'rules.col.enabled': 'On',
  'rules.confirmDelete': 'Delete this rule?',
  'rules.editTitle': 'Edit rule',
  'rules.added': 'Rule added — active immediately',
  'rules.anyProject': 'Any project',
  'rules.anyEnv': 'Any environment',
  'rules.anyEvent': 'Any event',
  'rules.connectHint': 'Connect the Coolify API to pick from a list',
  'rules.status.failure': 'Failures / alerts only',
  'rules.status.success': 'Successes only',
  'rules.destRequired': 'Pick a destination',

  'history.title': 'Recent deliveries',
  'history.failed': '{n} failed',
  'history.auto': 'Auto refresh',
  'history.empty': 'No events yet — try "Send test" in Coolify.',
  'history.col.time': 'Time',
  'history.noRoute': 'No matching rule and no fallback destination',

  'sim.title': 'Try your rules',
  'sim.help': 'Paste a payload like the ones Coolify sends and see where it would go.',
  'sim.sample.deployOk': 'Deploy succeeded',
  'sim.sample.deployFail': 'Deploy failed',
  'sim.sample.backupFail': 'Backup failed',
  'sim.sample.serverDown': 'Server down',
  'sim.run': 'Show where it goes',
  'sim.send': 'Send for real',
  'sim.invalidJson': 'Invalid JSON',
  'sim.queued': 'Queued — check History for the result',
  'sim.nowhere': 'Goes nowhere',
  'sim.nowhereDesc': 'No rule matches and no fallback is set.',
  'sim.willSend': 'Will be sent to',
  'sim.viaFallback': 'Via the fallback, because no rule matched',
  'sim.uuidPlaceholder': 'put a real database uuid here',
}

const dicts: Record<Lang, Record<MessageKey, string>> = { th, en }

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: T; dateLocale: string }

const LangContext = createContext<Ctx | null>(null)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang')
    if (saved === 'th' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en'
}

export function LangProvider({ children }: { children: (lang: Lang) => ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = initialLang()
    setApiLang(l)
    document.documentElement.lang = l
    return l
  })

  const setLang = useCallback((l: Lang) => {
    setApiLang(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem('lang', l)
    } catch {
      /* storage unavailable */
    }
    setLangState(l)
  }, [])

  const value = useMemo<Ctx>(() => {
    const dict = dicts[lang]
    const t: T = (key, vars) => {
      let s = dict[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    }
    return { lang, setLang, t, dateLocale: lang === 'th' ? 'th-TH' : 'en-GB' }
  }, [lang, setLang])

  return <LangContext.Provider value={value}>{children(lang)}</LangContext.Provider>
}

export function useI18n() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useI18n outside LangProvider')
  return ctx
}
