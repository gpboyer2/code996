import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { CLIManager } from '../cli'

// Mock chalk to avoid color output in tests
jest.mock('chalk', () => ({
  blue: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  green: jest.fn((text) => text),
  red: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  hex: jest.fn(() => (text: string) => text),
  bold: Object.assign(jest.fn((text) => text), {
    blue: jest.fn((text) => text),
  }),
}))

describe('CLIManager', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>
  let cli: CLIManager

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    cli = new CLIManager()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('help command', () => {
    it('should display help information', () => {
      cli.parse(['node', 'git-workload-report', 'help'])

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('git-workload-report'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('使用方法:'))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('命令:'))
    })
  })
})
