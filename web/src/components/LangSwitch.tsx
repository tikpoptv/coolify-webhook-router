import { Segmented } from 'antd'
import { useI18n, type Lang } from '../i18n'

export default function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <Segmented<Lang>
      size="small"
      value={lang}
      onChange={setLang}
      options={[
        { value: 'th', label: 'TH' },
        { value: 'en', label: 'EN' },
      ]}
    />
  )
}
