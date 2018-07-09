/* eslint-disable */

function initCA(init) {
  const ca = init()

  subscribeEvent(ca)
  ca.connect()
  onUsbkeyInsert(ca)

  window.ca = ca
}

function subscribeEvent(ca) {
  ca.eventObb.subscribe(ev => {
    console.log('outer ev:', ev)

    if (ev.action === 'usbkeyChange') {
      if (ev.payload.retVal === 'insert') {
        onUsbkeyInsert(ca)
      }
      else if (ev.payload.retVal === 'remove') {
        onUsbkeyRemove()
      }
    }
  })
}

function onUsbkeyInsert(ca) {
  ca.getUserList().subscribe(
    updateSelect,
    console.error,
  )
}

function onUsbkeyRemove(ca) {
  console.log('usbkey removed')
  updateSelect([])
  document.querySelector('#loginForm').reset()
}

// 更新下拉列表
function updateSelect(list) {
  console.log('updateSelect data:', list)
  const select = document.querySelector('#userList')

  if (list && list.length) {  // fill
    for (const row of list) {
      const item = new Option(row.username, row.certId)

      select.options.add(item)
    }
  }
  else if (select.options.length) { // clean
    for (let i = 0, len = select.options.length; i < len; i++) {
      select.remove(i)
    }
  }
}


function login(form) {
  const { forkJoin } = rxjs
  const { catchError, concatMap, take, tap, mergeMap } = rxjs.operators


  // 1. 获取服务器证书
  const serverCert = 'MIIE9TCCA92gAwIBAgIKIAAAAAAAARJTiDANBgkqhkiG9w0BAQUFADA6MQswCQYDVQQGEwJDTjENMAsGA1UECgwEQkpDQTENMAsGA1UECwwEQkpDQTENMAsGA1UEAwwEQkpDQTAeFw0wOTEwMjExNjAwMDBaFw0xMTEwMDExNTU5NTlaMEgxCzAJBgNVBAYTAkNOMQ0wCwYDVQQKDARCSkNBMQ0wCwYDVQQLDARCSkNBMRswGQYDVQQDDBLmnI3liqHlmajor4HkuabkuowwgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBAKUPfJUjN1t0ssHbRrpB9qQ0FyS64cxhlR93+jMPsKCiAYG7pn3NTveFBTFTSuR8Bmt3vUWU2g6IJba7WMEnHRdB9IoFW/0BMLlzAhXKAG7BHBEzqY6VsFr5Kstw1cME8zfTjZqXreL7ha4IJM02VF831xSe2t7+3GKVot/X9xcrAgMBAAGjggJxMIICbTAfBgNVHSMEGDAWgBTBzihoGF2OgzPxlaoIwz2KCJqddjAMBgNVHQ8EBQMDB/gAMCsGA1UdEAQkMCKADzIwMDkxMDIyMDAwMDAwWoEPMjAxMTEwMDEyMzU5NTlaMAkGA1UdEwQCMAAwgZkGA1UdHwSBkTCBjjBWoFSgUqRQME4xCzAJBgNVBAYTAkNOMQ0wCwYDVQQKDARCSkNBMQ0wCwYDVQQLDARCSkNBMQ0wCwYDVQQDDARCSkNBMRIwEAYDVQQDEwljYTJjcmwzNDkwNKAyoDCGLmh0dHA6Ly9sZGFwLmJqY2Eub3JnLmNuL2NybC9iamNhL2NhMmNybDM0OS5jcmwwEQYJYIZIAYb4QgEBBAQDAgD/MCoGC2CGSAFlAwIBMAkKBBtodHRwOi8vYmpjYS5vcmcuY24vYmpjYS5jcnQwGgYFKlYLBwkEEUpKMDExMDAwMTAwMDE1MTEyMB0GCGCGSAGG+EQCBBFKSjAxMTAwMDEwMDAxNTExMjAbBggqVoZIAYEwAQQPMDExMDAwMTAwMDE1MTEyMB4GBipWCwcBCAQUMUJASkowMTEwMDAxMDAwMTUxMTIwgbAGA1UdIASBqDCBpTA1BgkqgRwBxTiBFQEwKDAmBggrBgEFBQcCARYaaHR0cDovL3d3dy5iamNhLm9yZy5jbi9jcHMwNQYJKoEcAcU4gRUCMCgwJgYIKwYBBQUHAgEWGmh0dHA6Ly93d3cuYmpjYS5vcmcuY24vY3BzMDUGCSqBHAHFOIEVAzAoMCYGCCsGAQUFBwIBFhpodHRwOi8vd3d3LmJqY2Eub3JnLmNuL2NwczANBgkqhkiG9w0BAQUFAAOCAQEAfNLOoVZkvg75NP7bZKbnvcr6rp8qxTK3X5JcyrUFrFMz324DYaY5MpN39V3+XDwklmy+1c///T/1em4lDavrZVY0PLAFWZPDz/C2E9/vHYkBX4GhkB+K1FuXp8rPSfipvMGFrTpd1071UZK/ncxrQRskIdJDfQWLn0He4hBHrQNu/4HpBqrDHM/EU470YguVXEOAfoIr5wpi6xt37C/9u1zv0RLdkeXonFCYb5iUsVsEDsIEYWSMItxBYu7zJgRhTRbNI9QHPNcFOpUoFwxRe4Ie4ZszUZRUxhtfI9I539qOt6/i4Hvv9P4mBypr15o+aG3oVjt+CbfKYGZBLorCoQ=='

  // 2. 产生随机数
  const random = 'OmViXIpleQCadIOFqqs8gM1ilYLpR+Qb'

  // 3. 对随机数签名得到签名值
  const encodedText = 'DacHJxBhxQ5mo4+yN/H4UmgLnE4oP6X1FD4i9Sn1ApPznKgQQgAIisy3Pwm1mLpolLjq03BbcfOaF9tJgBU2TXyOzcv5in9gzPdotNZR6lo05c6hV9IcBP3hA7xDf/5bDW2umrlPUwAeQrxEh80vgwznAGA51nGU4++3Hdo/p5A='

  const pdata = {
    certId: form.userList.value, // 用户usbkey标识
    certUniqueId: '',   // 证书唯一标识
    userCert: '',  // 用户（签名）证书
    userRandom: '', // 随机数
    userEncodedRandom: '',  // 对随机数签名结果
  }
  // 密码
  const pwd = form.passwd.value

  // 密码空校验
  if ( ! pwd) {
    alert('请输入证书口令！')
    return false
  }
  // 长度校验
  if (pwd.length < 6 || pwd.length > 16) {
    alert('口令长度必须大于6位小于16位！')
    return false
  }

  const verifyUserPIN$ = ca.verifyUserPIN(pdata.certId, pwd).pipe(
    tap(valid => {
      if (! valid) {
        throw new Error('验证用户证书口令失败')
      }
    }),
  )
  const genRandom$ = ca.genRandom().pipe( // 生成随机数
    tap(str => {
      if (str) {
        pdata.userRandom = str
      }
      else {
        pdata.userRandom = ''
        pdata.userEncodedRandom = ''
        throw new Error('生成随机数失败')
      }
    }),
  )
  const verifySignedData$ = ca.verifySignedData(serverCert, random, encodedText).pipe( // 验证服务器证书签名
    tap(valid => {
      if (!valid) {
        throw new Error('验证服务器证书签名失败')
      }
    }),
  )

  forkJoin(
    verifyUserPIN$,
    verifySignedData$,
    genRandom$,
  )
    .pipe(
      mergeMap(() => {
        return ca.verifySignedData(serverCert, random, encodedText).pipe( // 验证服务器证书签名
          tap(valid => {
            if (!valid) {
              throw new Error('验证服务器证书签名失败')
            }
          }),
        )
      }),
      mergeMap(() => {
        return ca.getSignCert(pdata.certId).pipe( // 获取用户签名证书
          tap(cert => {
            if (cert) {
              pdata.userCert = cert
            }
            else {
              throw new Error('获取用户签名证书失败')
            }
          }),
        )
      }),
      mergeMap(() => {
        // 对随机数签名
        return ca.signData(pdata.certId, pdata.userRandom).pipe(
          tap(str => {
            if (!str) {
              pdata.userRandom = ''
              pdata.userEncodedRandom = ''
              throw new Error('签名随机数失败')
            }
          }),
        )
      }),
      mergeMap(() => {
        // 获取证书唯一标识
        return ca.getCertEntity(pdata.userCert).pipe(
          tap(certUniqueId => {
            pdata.certUniqueId = certUniqueId
          }),
        )
      }),
      mergeMap(() => {
        // 获取证书有效期
        return ca.getCertInfo(pdata.userCert, [11, 12]).pipe(
          tap(console.log),
          tap(validateCertExpiry), // 验证证书有效期
        )
      }),
  )
    .subscribe(
      () => {
        submit(pdata)
      },
      err => {
        console.error(err)
        alert(err)
      },
  )
  return

}

function validateCertExpiry(info) {
  if (! info.not_before || ! info.not_after) {
    throw new Error('证书有效期为空')
  }
  // YYYYMMDDHHmmss
  const startStr = info.not_before
  const endStr = info.not_after
  const now = dayjs()
  const start = dayjs(new Date(
    startStr.slice(0, 4), // YYYY
    startStr.slice(4, 6) - 1, // MM
    startStr.slice(6, 8), // DD
    startStr.slice(8, 10),  // HH
    startStr.slice(10, 12),  // mm
    startStr.slice(12, 14)  // ss
  ))
  const end = dayjs(new Date(
    endStr.slice(0, 4),
    endStr.slice(4, 6) - 1,
    endStr.slice(6, 8),
    endStr.slice(8, 10),
    endStr.slice(10, 12),
    endStr.slice(12, 14)
  ))

  if (now < start) {
    throw new Error('证书有效期尚未开始')
  }
  if (now >= end) {
    throw new Error('证书已过期 请尽快到北京数字证书认证中心办理证书更新手续！')
  }
  const diff = Math.floor(end.diff(now, 'day'))

  if (diff <= 60) {
    alert("您的证书距离过期还有：" + diff + "天，请尽快到北京数字证书认证中心办理证书更新手续！")
  }
}

function submit(pdata) {
  // 展示唯一标识符
  alert('证书标识: ' + pdata.certUniqueId)

  // jQuery ajax 提交表单
  return $.post('submit.do', pdata)
    .then(ret => {
      console.log(ret)
      alert('提交成功')
    })
    .catch(err => {
      console.error(err)
      alert('提交失败')
    })
}
