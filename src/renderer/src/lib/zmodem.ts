// Zmodem (lrzsz) file transfer handler for terminal sessions
// Detects and manages Zmodem file transfers over the terminal data stream

export interface ZmodemTransfer {
  sessionId: string
  direction: 'upload' | 'download'
  fileName?: string
  fileSize?: number
  progress: number
  status: 'pending' | 'transferring' | 'complete' | 'error' | 'cancelled'
  errorMessage?: string
}

const ZMODEM_START_RZ = '\x72\x7a\x0d'       // rz\r
const ZMODEM_START_SZ = '\x73\x7a\x0d'       // sz\r
const ZMODEM_START_SIG = '\x2a\x2a\x18\x42'  // **\x18B (zrinit)

class ZmodemManager {
  private transfers = new Map<string, ZmodemTransfer>()
  private enabledSessions = new Set<string>()
  private detectionBuffer = new Map<string, string>()

  enable(sessionId: string): void {
    this.enabledSessions.add(sessionId)
    this.detectionBuffer.set(sessionId, '')
  }

  disable(sessionId: string): void {
    this.enabledSessions.delete(sessionId)
    this.detectionBuffer.delete(sessionId)
    this.transfers.delete(sessionId)
  }

  isEnabled(sessionId: string): boolean {
    return this.enabledSessions.has(sessionId)
  }

  /**
   * Process incoming terminal data to detect Zmodem sequences
   * Returns true if data was handled (should not be written to terminal)
   */
  processData(sessionId: string, data: string): { handled: boolean; transfer?: ZmodemTransfer } {
    if (!this.enabledSessions.has(sessionId)) {
      return { handled: false }
    }

    // Check for active transfer
    const activeTransfer = this.transfers.get(sessionId)
    if (activeTransfer?.status === 'transferring') {
      // Route data to IPC for processing
      this.handleTransferData(sessionId, data)
      return { handled: true, transfer: activeTransfer }
    }

    // Accumulate buffer for detection
    let buffer = this.detectionBuffer.get(sessionId) || ''
    buffer += data

    // Keep buffer reasonable size (last 100 chars)
    if (buffer.length > 100) {
      buffer = buffer.slice(-100)
    }
    this.detectionBuffer.set(sessionId, buffer)

    // Detect Zmodem start sequences
    if (buffer.includes(ZMODEM_START_RZ) || buffer.includes(ZMODEM_START_SIG)) {
      // Remote wants to send file (we receive)
      this.startReceive(sessionId)
      return { handled: true, transfer: this.transfers.get(sessionId) }
    }

    if (buffer.includes(ZMODEM_START_SZ)) {
      // Remote wants to receive file (we send)
      this.startSend(sessionId)
      return { handled: true, transfer: this.transfers.get(sessionId) }
    }

    return { handled: false }
  }

  private async startReceive(sessionId: string): Promise<void> {
    const transfer: ZmodemTransfer = {
      sessionId,
      direction: 'download',
      progress: 0,
      status: 'pending'
    }
    this.transfers.set(sessionId, transfer)

    // Notify main process to start receive dialog
    try {
      const result = await window.api.zmodem.receiveStart(sessionId)
      if (result.cancelled) {
        transfer.status = 'cancelled'
      } else if (result.success) {
        transfer.status = 'transferring'
        transfer.fileName = result.filePath?.split('/').pop() || result.filePath?.split('\\').pop()
      } else {
        transfer.status = 'error'
        transfer.errorMessage = result.error
      }
    } catch (err) {
      transfer.status = 'error'
      transfer.errorMessage = String(err)
    }

    this.transfers.set(sessionId, transfer)
    this.emitUpdate(sessionId, transfer)
  }

  private async startSend(sessionId: string): Promise<void> {
    const transfer: ZmodemTransfer = {
      sessionId,
      direction: 'upload',
      progress: 0,
      status: 'pending'
    }
    this.transfers.set(sessionId, transfer)

    // Notify main process to show file picker
    try {
      const result = await window.api.zmodem.sendStart(sessionId)
      if (result.cancelled) {
        transfer.status = 'cancelled'
      } else if (result.success) {
        transfer.status = 'transferring'
        transfer.fileName = result.fileName
        transfer.fileSize = result.fileSize
      } else {
        transfer.status = 'error'
        transfer.errorMessage = result.error
      }
    } catch (err) {
      transfer.status = 'error'
      transfer.errorMessage = String(err)
    }

    this.transfers.set(sessionId, transfer)
    this.emitUpdate(sessionId, transfer)
  }

  private async handleTransferData(sessionId: string, data: string): Promise<void> {
    // Send data to main process for protocol handling
    try {
      const result = await window.api.zmodem.processData(sessionId, data)

      if (result.complete) {
        const transfer = this.transfers.get(sessionId)
        if (transfer) {
          transfer.status = 'complete'
          transfer.progress = 100
          this.transfers.set(sessionId, transfer)
          this.emitUpdate(sessionId, transfer)
        }
      }
    } catch (err) {
      console.error('[Zmodem] Transfer error:', err)
      const transfer = this.transfers.get(sessionId)
      if (transfer) {
        transfer.status = 'error'
        transfer.errorMessage = String(err)
        this.transfers.set(sessionId, transfer)
        this.emitUpdate(sessionId, transfer)
      }
    }
  }

  async abortTransfer(sessionId: string): Promise<void> {
    const transfer = this.transfers.get(sessionId)
    if (transfer && transfer.status === 'transferring') {
      await window.api.zmodem.abort(sessionId)
      transfer.status = 'cancelled'
      this.transfers.set(sessionId, transfer)
      this.emitUpdate(sessionId, transfer)
    }
  }

  async getStatus(sessionId: string): Promise<ZmodemTransfer | null> {
    return this.transfers.get(sessionId) || null
  }

  getAllTransfers(): ZmodemTransfer[] {
    return Array.from(this.transfers.values())
  }

  private listeners = new Set<(transfer: ZmodemTransfer) => void>()

  onUpdate(callback: (transfer: ZmodemTransfer) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private emitUpdate(_sessionId: string, transfer: ZmodemTransfer): void {
    this.listeners.forEach(cb => cb(transfer))
  }
}

// Singleton instance
export const zmodemManager = new ZmodemManager()

// React hook for Zmodem state
import { useState, useEffect } from 'react'

export function useZmodem(sessionId: string): {
  transfer: ZmodemTransfer | null
  abort: () => Promise<void>
} {
  const [transfer, setTransfer] = useState<ZmodemTransfer | null>(null)

  useEffect(() => {
    // Enable Zmodem for this session
    zmodemManager.enable(sessionId)

    // Update state when transfer changes
    const updateTransfer = (t: ZmodemTransfer) => {
      if (t.sessionId === sessionId) {
        setTransfer({ ...t })
      }
    }

    const unsubscribe = zmodemManager.onUpdate(updateTransfer)

    // Check initial status
    zmodemManager.getStatus(sessionId).then(t => {
      if (t) setTransfer(t)
    })

    return () => {
      unsubscribe()
      zmodemManager.disable(sessionId)
    }
  }, [sessionId])

  const abort = async () => {
    await zmodemManager.abortTransfer(sessionId)
  }

  return { transfer, abort }
}
