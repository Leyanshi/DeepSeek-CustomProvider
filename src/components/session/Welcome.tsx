import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MobileHeader } from './MobileHeader.js'
import deepseekLogo from '../../../resources/deepseek.svg'
import styles from './Welcome.module.css'

/** 新对话：LOGO、问候语与输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.intro}>
          <img
            className={styles.logo}
            src={deepseekLogo}
            alt={t('appName')}
            width={64}
            height={64}
          />
          <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        </div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
