import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: object[] = []

/** 遮罩 + 居中卡片，Esc / 点遮罩关闭 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  className,
  mainClassName,
  open = true,
  animated = false,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  /** Controlled visibility for callers that retain content during the closing animation. */
  open?: boolean
  animated?: boolean
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const [entered, setEntered] = useState(false)
  const visible = open && (!animated || entered)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open || !animated) {
      setEntered(false)
      return
    }
    let secondFrame = 0
    // Paint the initial state before starting the transition, including on older WebViews.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [open, animated])
  useEffect(() => {
    if (!open) {
      return
    }
    const token = {}
    openModals.push(token)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === token) {
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openModals.splice(openModals.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return createPortal(
    <div
      className={clsx(styles.overlay, animated && styles.animated, visible && styles.visible)}
      aria-hidden={!open}
      onMouseDown={(event) => open && event.target === event.currentTarget && onClose()}
    >
      <div
        className={clsx(styles.content, className)}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={onClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
