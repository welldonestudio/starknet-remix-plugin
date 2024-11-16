/* eslint-disable */
import JSZip from 'jszip'
import React from 'react'
import Container from '../../components/ui_components/Container'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { isVerifyingAtom, isVerifiedAtom, verificationAtom } from '../../atoms/verification'

import type { AccordianTabs } from '../Plugin'
import type { RequestVerification, CheckVerification } from '../../utils/types/verification'
import axios from 'axios'
import { deploymentAtom } from '../../atoms/deployment'
import { compilationAtom } from '../../atoms/compilation'
import { cairoVersionAtom } from '../../atoms/cairoVersion'
import { envAtom } from '../../atoms/environment'
import { useAccount, useNetwork } from '@starknet-react/core'
import useRemixClient from '../../hooks/useRemixClient'
import { StarknetChainId } from '../../utils/types/accounts'
import { BigNumber } from 'ethers'

const ENDPOINT = 'https://verify.welldonestudio.io/starknet/verifications'

interface UploadFile {
  chainId: string
  account: string
  timestamp: string
  zipFile: Blob
}

export interface FileInfo {
  path: string
  isDirectory: boolean
}

interface VerificationProps {
  setAccordian: React.Dispatch<React.SetStateAction<AccordianTabs>>
}
const Verification: React.FC<VerificationProps> = ({ setAccordian }) => {
  const { status: accountStatus, address } = useAccount()
  const { remixClient } = useRemixClient()
  const { chain } = useNetwork()

  const env = useAtomValue(envAtom)
  const cairoVersion = useAtomValue(cairoVersionAtom)
  const { isValidCairo, compileTimestamp } = useAtomValue(compilationAtom)
  const { status, isVerifying, isVerified } = useAtomValue(verificationAtom)
  const { declStatus, notEnoughInputs, declTxHash, deployTxHash, deployAddress } = useAtomValue(deploymentAtom)

  const setIsVerifying = useSetAtom(isVerifyingAtom)
  const setIsVerified = useSetAtom(isVerifiedAtom)

  const checkVerification = async ({ chainId, contractAddress }: CheckVerification) => {
    try {
      const response = await axios.get(`${ENDPOINT}/chainId=${chainId}&contractAddress=${contractAddress}`)
      console.log(response)
    } catch (error) {
      console.error(error)
    }
  }

  const requestVerification = async () => {
    try {
      const currentWorkspace = await remixClient.filePanel.getCurrentWorkspace()
      const files = await allFileFromWorkspace(remixClient, currentWorkspace.absolutePath)
      const blob = await generateZip(remixClient, files)
      if (!blob || !address) return

      const upload = await uploadFile({
        chainId: BigNumber.from(chain.id.toString()).toHexString(),
        timestamp: compileTimestamp,
        account: address,
        zipFile: blob
      })
      if (!upload) return

      const response = await axios.post(ENDPOINT, {
        contractAddress: deployAddress,
        declareTxHash: declTxHash,
        scarbVersion: cairoVersion.replace('v', ''),
        srcFileId: compileTimestamp,
        chainId: BigNumber.from(chain.id.toString()).toHexString(),
        verifyRequestAddress: address
      })
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <Container>
      <h1>deployAddress: {deployAddress}</h1>
      <h1>declareTxHash: {declTxHash}</h1>
      <h1>scarbVersion: {cairoVersion.replace('v', '')}</h1>
      <h1>srcFileId: {compileTimestamp}</h1>
      <h1>chainId: {BigNumber.from(chain.id.toString()).toHexString()}</h1>
      <h1>verifyRequestAddress: {address}</h1>
      <button onClick={requestVerification}>Test</button>
    </Container>
  )
}

export default Verification

const allFileFromWorkspace = async (remixClient: any, dirName: string): Promise<FileInfo[]> => {
  if (!remixClient) return []
  try {
    let result: FileInfo[] = []
    const files = await remixClient.fileManager.readdir(dirName)
    for (const [key, val] of Object.entries(files)) {
      const file_ = {
        path: key,
        isDirectory: (val as any).isDirectory
      }
      if (file_.isDirectory) {
        const subDirFiles = (await allFileFromWorkspace(remixClient, file_.path)) || []

        result = [...result, file_, ...subDirFiles]
      } else {
        result.push(file_)
      }
    }
    return result
  } catch (error) {
    console.error(error)
    return []
  }
}

const generateZip = async (remixClient: any, fileInfos: Array<FileInfo>) => {
  if (!remixClient) return
  const zip = new JSZip()

  await Promise.all(
    fileInfos.map(async (fileinfo: FileInfo) => {
      if (!fileinfo.isDirectory) {
        const content = await remixClient.fileManager.readFile(fileinfo.path)
        const f = createFile(content || '', fileinfo.path.substring(fileinfo.path.lastIndexOf('/') + 1))
        const chainFolderExcluded = fileinfo.path.substring(fileinfo.path.indexOf('/') + 1)
        const projFolderExcluded = chainFolderExcluded.substring(chainFolderExcluded.indexOf('/') + 1)
        zip.file(projFolderExcluded, f)
      }
    })
  )
  return await zip.generateAsync({ type: 'blob' })
}

const createFile = (code: string, name: string) => {
  const blob = new Blob([code], { type: 'text/plain' })
  return new File([blob], name, { type: 'text/plain' })
}

const uploadFile = async ({ chainId, account, timestamp, zipFile }: UploadFile) => {
  const formData = new FormData()
  formData.append('chainName', 'starknet')
  formData.append('chainId', chainId)
  formData.append('account', account)
  formData.append('timestamp', timestamp)
  formData.append('fileType', 'starknet')
  formData.append('zipFile', zipFile)
  const res = await axios.post('https://dev.compiler.welldonestudio.io' + '/s3Proxy/src-v2', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Accept: 'application/json'
    }
  })

  return res.status === 201
}
