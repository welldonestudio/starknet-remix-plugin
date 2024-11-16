import type { StarknetChainId } from './accounts'

interface CheckVerification {
  chainId: StarknetChainId
  contractAddress: string
}

interface RequestVerification {
  declareTxHash: string
  contractAddress: string
  chainId: StarknetChainId
  timestamp: string
  scarbVersion: string
}

export type { CheckVerification, RequestVerification }
