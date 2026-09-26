import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

export async function openSettingsWindow(title: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel('settings')
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }

  await new Promise<void>((resolve, reject) => {
    const settings = new WebviewWindow('settings', {
      url: 'index.html?window=settings',
      title,
      width: 920,
      height: 740,
      minWidth: 760,
      minHeight: 600,
      center: true,
      resizable: true,
    })
    void settings.once('tauri://created', () => resolve())
    void settings.once('tauri://error', (event) => reject(new Error(String(event.payload))))
  })
}
