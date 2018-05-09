import { interval, Subject, Subscription } from 'rxjs'
import { tap } from 'rxjs/operators'

import { parseCertList } from './cert'
import { initialWsEvent, initialWsOpts } from './config'
import {
  Actions,
  Cert,
  CertId,
  CertInfo,
  CertKinds,
  CertUniqueId,
  DeviceType,
  EncodedText,
  InitialWsOpts,
  MsgId,
  MsgQueueCb,
  PlainText,
  SendArgs,
  SrvEvent,
  SrvMethod,
  UserInfo,
  WsEvent,
  WsOpts,
  WsRecvData,
  WsSendData,
} from './model'
import RxWebsocketSubject from './rxws'


let globalMsgId: MsgId = 0

export class Bjca {
  // public subject: Subject<CaEvent>
  public subject: Subject<WsEvent>
  public options: WsOpts

  constructor(options?: InitialWsOpts) {
    this.options = this.parseOptions(options)
    this.wsSubject = null
    this.wsSub = null
    this.keppAliveSub = null
    this.subject = new Subject()
  }

  private wsSubject: RxWebsocketSubject<WsRecvData> | null
  private wsSub: Subscription | null
  private msgQueue = <Map<MsgId, MsgQueueCb>> new Map()  // request from client
  private keppAliveSub: Subscription | null

  parseOptions(options?: InitialWsOpts) {
    const opts = <WsOpts> options ? { ...initialWsOpts, ...options } : { ...initialWsOpts }

    return opts
  }

  connect() {
    this.disconnect()
    this.wsSubject = new RxWebsocketSubject('ws://127.0.0.1:4044/')
    this.subject.next({ ...initialWsEvent, action: Actions.wsConnected })

    this.wsSub = this.wsSubject.subscribe(
      data => this.handleMsgEventData(data),

      data => this.subject.next({
        ...initialWsEvent,
        action: Actions.wsClosedException,
        payload: data,
      }),

      () => this.subject.next({
        ...initialWsEvent,
        action: Actions.wsClosed,
      }),
    )

    this.wsSubject && this.getVersion() && this.keppAlive()
  }


  disconnect() {
    this.wsSub && this.wsSub.unsubscribe()
    this.wsSubject && this.wsSubject.unsubscribe()
    this.keppAliveSub && this.keppAliveSub.unsubscribe()
    this.keppAliveSub = this.wsSub = this.wsSubject = null
    this.clearMsgEvent()

    this.subject.next({ ...initialWsEvent, action: Actions.wsDisconnected })
  }


  getVersion(): Promise<string> {
    return this.sendMsg(SrvMethod.getVersion)
  }

  // 获取用户列表证书相关信息
  getUserListInfo(deviceType: DeviceType = DeviceType.hard, kinds?: CertKinds[]): Promise<Array<Partial<CertInfo>>> {
    return this.getUserList(deviceType)
      .then(arr => {
        const pms = <Array<Promise<Partial<CertInfo>>>> []

        for (const { certId } of arr) {
          const pm = <Promise<Partial<CertInfo>>> this.getSignCert(certId)
            .then(cert => this.getCertInfo(cert, kinds))
            .catch(err => <Partial<CertInfo>> {})

          pms.push(pm)
        }

        return Promise.all(pms)
      })
  }

  // user of certificate
  getUserList(deviceType: DeviceType = DeviceType.hard): Promise<UserInfo[]> {
    return this.sendMsg(SrvMethod.getUserList)
      .then(parseCertList)
      .then(arr => {
        return Promise.all(arr.map(row => {
          return this.getDeviceType(row.certId)
            .then(kind => kind === deviceType && row)
        }))
      })
      .then(retArr => <UserInfo[]> retArr.filter(row => row && row.certId))
      .catch(err => {
        this.subject.next({
          ...initialWsEvent,
          action: Actions.exception,
          msg: 'getUserList()',
          payload: err,
        })
        return []
      })
  }


  // HARD USBKey or SOFT
  getDeviceType(certId: CertId): Promise<DeviceType> {
    return this.getDeviceInfo([certId, 7]).then(str => {
      if (str === 'HARD' || str === 'SOFT') {
        return <DeviceType> str
      }
      else {
        throw new Error(`value of DeviceType invalid："${str}"`)
      }
    })
  }

  getDeviceInfo(args: SendArgs): Promise<string> {
    return this.sendMsg(SrvMethod.getDeviceInfo, args)
  }

  // 根据证书id获取签名证书
  getSignCert(certId: CertId): Promise <string > {
    return this.sendMsg(SrvMethod.getSignCert, certId)
  }

  // 获取证书唯一标识
  getCertEntity(cert: Cert): Promise<CertUniqueId> {
    return this.sendMsg(SrvMethod.getCertEntity, cert)
  }

  getCertBasicinfo(cert: Cert, kind: CertKinds) {
    return this.sendMsg(SrvMethod.getCertInfo, [cert, kind])
  }

  // 获取证书信息， kinds数组决定查询字段
  getCertInfo(cert: Cert, kinds?: CertKinds[]): Promise<Partial<CertInfo>> {
    if (!kinds) {
      kinds = []
      const arr = Object.entries(CertKinds)

      for (const [value] of arr.slice(0, (arr.length / 2))) {
        kinds.push(+value)
      }
    }
    const pms = []

    for (const kind of kinds) {
      const pm = this.getCertBasicinfo(cert, kind)
        .then(data => <Partial<CertInfo>> { [CertKinds[kind]]: data })

      pms.push(pm)
    }

    return Promise.all(pms)
      .then(arr => {
        const ret = <Partial<CertInfo>> {}

        for (const row of arr) {
          Object.assign(ret, row)
        }
        return ret
      })
  }

  // （简单）验证证书有效
  validateCert(cert: Cert): Promise<boolean> {
    return this.sendMsg(SrvMethod.validateCert, cert)
      .then(ret => ret === '0' || ret.toLowerCase() === 'true' ? true : false)
  }

  // 获取服务器提供的随机数
  genRandom(strLen: number = 32): Promise<string> {
    return this.sendMsg(SrvMethod.genRandom, strLen)
  }

  verifyUserPIN(certId: CertId, pin: string): Promise<boolean> {
    return this.sendMsg(SrvMethod.verifyUserPIN, [certId, pin])
      .then(ret => ret === 'true' ? true : false)
  }

  verifySignedData(cert: Cert, plain: PlainText, enc: EncodedText) {
    return this.sendMsg(SrvMethod.verifySignedData, [cert, plain, enc])
      .then(ret => ret === 'true' ? true : false)
  }

  signData(certId: CertId, plain: PlainText) {
    return this.sendMsg(SrvMethod.signData, [certId, plain])
  }

  /* -------- private --------------- */

  private sendMsg(methodName: WsSendData['xtx_func_name'], args?: SendArgs): Promise <string> {
    return new Promise((resolve, reject) => {
      const data = this.parseSendOpts(methodName, args)

      if (this.wsSubject) {
        this.wsSubject.send(data)
        this.regMsgEvent(+data.call_cmd_id, resolve)
        this.subject.next({
          ...initialWsEvent,
          action: Actions.wsSend,
          msgId: +data.call_cmd_id,
        })
      }
      else {
        this.subject.next({
          ...initialWsEvent,
          action: Actions.wsNoneAvailable,
        })
        reject(Actions.wsNoneAvailable)
      }
    })
  }


  private handleMsgEventData(data: WsRecvData): void {
    const event = { ...initialWsEvent, payload: data }

    if (! data) {
      event.action = Actions.invalidRecvedData
      this.subject.next(event)
      return
    }
    if (Number.isNaN(+data.call_cmd_id)) {  // by server push
      this.handlePushMsg(data)
    }
    else {  // by client request
      this.handleRequestMsg(data)
    }
  }

  private handlePushMsg(data: WsRecvData): void {
    const event = { ...initialWsEvent, payload: data }
    const str = data.call_cmd_id

    if (typeof str === 'string') {
      // @ts-ignore
      const eventName = SrvEvent[str]

      event.action = eventName ? eventName : SrvEvent.onUnknownEvent
    }
    else {
      event.action = SrvEvent.onUnknownEvent
    }

    this.subject.next(event)
  }

  private handleRequestMsg(data: WsRecvData): void {
    const event = { ...initialWsEvent, payload: data }

    event.msgId = +data.call_cmd_id
    const resolve = this.retriveMsgEvent(event.msgId)

    if (resolve) {
      if (typeof resolve === 'function') {
        event.action = Actions.wsRecv
        this.subject.next(event)
        resolve(data.retVal)
      }
      else {
        event.action = Actions.invalidRecvCb
        event.msg = 'callback from msgQueue is NOT a function'
        this.subject.next(event)
        // throw new Error('callback from msgQueue is NOT a function')
      }
    }
    else {
      event.action = Actions.invalidRecvCb
      event.msg = 'callback from msgQueue is invalid'
      this.subject.next(event)
      // throw new Error('callback from msgQueue is invalid')
    }
  }


  private regMsgEvent(key: MsgId, cb: any) {
    if (! this.msgQueue.has(+key)) {
      this.msgQueue.set(key, cb)
    }
    else {
      throw new Error(`Can not re-register msg event. key: "${key}"`)
    }
  }

  // get callback and delete it if not srvEvent
  private retriveMsgEvent(key: MsgId) {
    const cb = this.getMsgEvent(key)

    this.unRegMsgEvent(key)
    return cb
  }

  private getMsgEvent(key: MsgId): MsgQueueCb | void {
    return this.msgQueue.get(key)
  }

  private unRegMsgEvent(key: MsgId) {
    this.msgQueue.delete(key)
  }

  private clearMsgEvent() {
    this.msgQueue.clear()
  }


  private parseSendOpts(methodName: string, args?: SendArgs): WsSendData {
    globalMsgId += 1
    const ret = <WsSendData> {
      xtx_func_name: methodName,
      // call_cmd_id: 'i_' + msgId,
      call_cmd_id: String(globalMsgId), // serial from client or event name from server such as 'onUsbkeyChange'
    }

    // if (this.version && this.version >= '2.14') {
    //   ret.URL = window.location.href
    // }
    if (typeof args === 'undefined') {
      return ret
    }

    if (Array.isArray(args)) {
      for (let i = 0, len = args.length; i < len; i++) {
        ret['param_' + (i + 1)] = args[i]
      }
    }
    else {
      ret.param_1 = args
    }

    return ret
  }


  private keppAlive() {
    if (this.wsSubject && this.wsSub && ! this.wsSub.closed) {
      // this.wsSubject.subscribe()
      const intv = this.options.keepAliveInterval

      if (intv > 0) {
        this.keppAliveSub = interval(intv)
          .pipe(
            tap(() => this.getVersion()),
        )
          .subscribe()
      }
    }
  }

} // END of class


export function init(options?: InitialWsOpts): Bjca {
  return new Bjca(options)
}
