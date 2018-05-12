import {
  UserInfo,
} from './model'


export function parseCertList(str: string): UserInfo[] {
  const ret = <UserInfo[]> []

  if (! str) {
    return ret
  }
  else if (! str.includes('&&&')) {
    return ret
  }
  // "username||999000100150181/5303201610000567&&&",
  str.split('&&&').forEach(data => {
    if (! data || ! data.trim()) {
      return
    }
    const tmp = data.split('||')

    if (tmp.length !== 2) {
      console.error('data format invalid', data)
    }
    else {
      ret.push({
        certId: tmp[1],
        username: tmp[0],
      })
    }
  })

  return ret
}


// throw error if invalid
export function validatePIN(pin: string | number, minLen: number = 4, maxLen: number = 16): void {
  if (typeof pin === 'string') {
    const len = pin.length

    if (len < 4) {
      throw new Error(`PIN minimum length is ${minLen} `)
    }
    return
  }

}
