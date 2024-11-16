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

const ENDPOINT = 'http://localhost:9000'

interface UploadFile {
  chainId: string
  contractAddress: string
  timestamp: string
  srcZipFile: Blob
}

// {
//   "contractAddress": "0x009b0a3a29c105c495b1869444662ce012fd119483201623721f698ddc05acdc",
//   "scarbVersion": "2.5.3",
//   "srcFileId": "1731738722663",
//   "chainId": "0x534e5f5345504f4c4941"
// }

interface StarknetVerifyRequest {
  contractAddress: string;
  scarbVersion: string;
  srcFileId: string;
  chainId: string
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
      console.log('currentWorkspace: ', currentWorkspace)
      const files = await allFileFromWorkspace(remixClient, currentWorkspace.absolutePath)
      console.log('files: ', files)
      const blob = await generateZip(remixClient, files)
      console.log('blob', blob)
      // return
      if (!blob || !address) return

      const srcFileId = await uploadFile({
        chainId: BigNumber.from(chain.id.toString()).toHexString(),
        timestamp: compileTimestamp,
        contractAddress: deployAddress,
        srcZipFile: blob
      })
      if (!srcFileId) return

      // const response = await axios.post(ENDPOINT, {
      //   contractAddress: deployAddress,
      //   declareTxHash: declTxHash,
      //   scarbVersion: cairoVersion.replace('v', ''),
      //   srcFileId: compileTimestamp,
      //   chainId: BigNumber.from(chain.id.toString()).toHexString(),
      //   verifyRequestAddress: address
      // })

      const res = await verify({
        contractAddress: deployAddress,
        scarbVersion: cairoVersion.replace('v', ''),
        srcFileId,
        chainId: BigNumber.from(chain.id.toString()).toHexString(),
      })
      console.log(res)
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
        console.log('chainFolderExcluded', chainFolderExcluded)
        const projFolderExcluded = chainFolderExcluded.substring(chainFolderExcluded.indexOf('/') + 1)
        console.log('projFolderExcluded', projFolderExcluded)
        zip.file(chainFolderExcluded, f)
      }
    })
  )
  return await zip.generateAsync({ type: 'blob' })
}

const createFile = (code: string, name: string) => {
  const blob = new Blob([code], { type: 'text/plain' })
  return new File([blob], name, { type: 'text/plain' })
}

const uploadFile = async ({ chainId, contractAddress, timestamp, srcZipFile }: UploadFile) => {
  const formData = new FormData()
  formData.append('chainId', chainId)
  formData.append('contractAddress', contractAddress)
  // formData.append('timestamp', timestamp)
  // formData.append('fileType', 'starknet')
  formData.append('srcZipFile', srcZipFile)
  const res = await axios.post(ENDPOINT + '/starknet/verifications/sources', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Accept: 'application/json'
    }
  })

  return res.data.srcFileId
}

// contractAddress: string;
// scarbVersion: string;
// srcFileId: string;
// chainId: string
const verify = async (request: StarknetVerifyRequest) => {
  const res = await axios.post(ENDPOINT + '/starknet/verifications', request, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  })

  return res.status === 201
}
