import { atom } from 'jotai'

//   status: 'Verifying....' as string,
//   setStatus: ((_: string) => {}) as React.Dispatch<React.SetStateAction<string>>,
const statusAtom = atom<string>('Verifying....')

//   isVerifying: false as boolean,
//   setIsVerifying: ((_: boolean) => {}) as React.Dispatch<React.SetStateAction<boolean>>,
const isVerifyingAtom = atom<boolean>(false)

//   isVerifyied: false as boolean,
//   setIsVerifyied: ((_: boolean) => {}) as React.Dispatch<React.SetStateAction<boolean>>,
const isVerifiedAtom = atom<boolean>(false)

type Keys = 'status' | 'isVerifying' | 'isVerified'

interface SetVerifyValue {
  key: Keys
  value: string | boolean | string[]
}

const verificationAtom = atom(
  (get) => {
    return {
      status: get(statusAtom),
      isVerifying: get(isVerifyingAtom),
      isVerified: get(isVerifiedAtom)
    }
  },
  (_get, set, newValue: SetVerifyValue) => {
    switch (newValue?.key) {
      case 'status':
        typeof newValue?.value === 'string' && set(statusAtom, newValue?.value)
        break
      case 'isVerifying':
        typeof newValue?.value === 'boolean' && set(isVerifyingAtom, newValue?.value)
        break
      case 'isVerified':
        typeof newValue?.value === 'boolean' && set(isVerifiedAtom, newValue?.value)
        break
    }
  }
)

export { statusAtom, isVerifyingAtom, isVerifiedAtom, verificationAtom }
