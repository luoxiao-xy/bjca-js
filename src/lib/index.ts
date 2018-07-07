import { empty, from as ofrom, timer, Observable, Observer, Subject, Subscription } from 'rxjs'
import {
  catchError,
  filter,
  map,
  mergeMap,
  reduce,
  switchMap,
  take,
  timeout,
} from 'rxjs/operators'

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
  eventObb: Observable<WsEvent>
  options: WsOpts
  private wsSubject: RxWebsocketSubject<WsRecvData> | null
  private wsSub: Subscription | null
  private subject: Subject<WsEvent>
  private keppAliveSub: Subscription | null

  constructor(options?: InitialWsOpts) {
    this.options = this.parseOptions(options)
    this.wsSubject = null
    this.wsSub = null
    this.keppAliveSub = null
    this.subject = new Subject()
    this.eventObb = Observable.create((obv: Observer<WsEvent>) => {
      this.subject.subscribe(
        data => obv.next(data),
        err => obv.error(err),
      )
    })
  }


  parseOptions(options?: InitialWsOpts): WsOpts {
    return options ? { ...initialWsOpts, ...options } : { ...initialWsOpts }
  }

  connect(): void {
    this.disconnect()
    this.wsSubject = new RxWebsocketSubject(`${this.options.host}:${this.options.ports[0]}`)
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

    this.wsSubject && this.keppAlive()
  }


  disconnect(): void {
    this.wsSub && this.wsSub.unsubscribe()
    this.wsSubject && this.wsSubject.unsubscribe()
    this.keppAliveSub && this.keppAliveSub.unsubscribe()
    this.keppAliveSub = this.wsSub = this.wsSubject = null

    this.subject.next({ ...initialWsEvent, action: Actions.wsDisconnected })
  }


  getVersion(): Observable<string> {
    return this.sendMsg(SrvMethod.getVersion)
  }


  // 获取用户列表证书相关信息
  getUserListInfo(deviceType: DeviceType = DeviceType.hard, kinds?: CertKinds[]): Observable<Array<Partial<CertInfo>>> {
    return this.getUserList(deviceType).pipe(
      filter(arr => arr && arr.length ? true : false),
      mergeMap((arr: UserInfo[]) => {
        return ofrom(arr).pipe(
          mergeMap(({ certId }) => this.getSignCert(certId)),
          mergeMap(cert => this.getCertInfo(cert, kinds)),
        )
      }),
      reduce((acc: Array<Partial<CertInfo>>, curr: Partial<CertInfo>) => {
        acc.push(curr)
        return acc
      }, <Array<Partial<CertInfo>>> []),
    )

  }


  // user of certificate
  getUserList(deviceType: DeviceType = DeviceType.hard): Observable<UserInfo[] | void> {
    return this.sendMsg(SrvMethod.getUserList).pipe(
      map(parseCertList),
      mergeMap(arr => {
        return ofrom(arr).pipe(
          mergeMap(row => {
            return this.getDeviceType(row.certId).pipe(
              filter(kind => kind === deviceType ? true : false),
              map(() => row),
            )
          }),
        )
      }),
      reduce((acc: UserInfo[], curr: UserInfo) => {
        acc.push(curr)
        return acc
      }, <UserInfo[]> []),
      catchError(err => {
        this.subject.next({
          ...initialWsEvent,
          action: Actions.exception,
          msg: 'getUserList()',
          err,
        })
        return empty()
      }),
    )
  }


  // HARD USBKey or SOFT
  getDeviceType(certId: CertId): Observable<DeviceType> {
    return this.getDeviceInfo([certId, 7]).pipe(
      map(str => {
        if (str === DeviceType.hard || str === DeviceType.soft) {
          return <DeviceType> str
        }
        else {
          throw new Error(`value of DeviceType invalid："${str}"`)
        }
      }),
    )
  }


  getDeviceInfo(args: SendArgs): Observable<string> {
    return this.sendMsg(SrvMethod.getDeviceInfo, args)
  }


  // 根据证书id获取签名证书
  getSignCert(certId: CertId): Observable<string> {
    return this.sendMsg(SrvMethod.getSignCert, certId)
  }


  // 获取证书唯一标识
  getCertEntity(cert: Cert): Observable<CertUniqueId> {
    return this.sendMsg(SrvMethod.getCertEntity, cert)
  }


  getCertBasicinfo(cert: Cert, kind: CertKinds) {
    return this.sendMsg(SrvMethod.getCertInfo, [cert, kind])
  }


  // 获取证书信息， kinds数组决定查询字段
  getCertInfo(cert: Cert, kinds?: CertKinds[]): Observable<Partial<CertInfo>> {
    const ret$ = ofrom(kinds ? kinds : Object.values(CertKinds)).pipe(
      mergeMap((kind: CertKinds) => {
        return this.getCertBasicinfo(cert, kind).pipe(
          map(data => {
            return <Partial<CertInfo>> { [CertKinds[kind]]: data }
          }),
        )
      }),
      reduce((acc, curr) => {
        acc = { ...acc, ...curr }
        return acc
      }, <Partial<CertInfo>> {}),
    )

    return ret$
  }


  // （简单）验证证书有效
  validateCert(cert: Cert): Observable<boolean> {
    return this.sendMsg(SrvMethod.validateCert, cert).pipe(
      map(ret => ret === '0' || ret.toLowerCase() === 'true' ? true : false),
    )
  }


  // 获取服务器提供的随机数
  genRandom(strLen: number = 32): Observable<string> {
    return this.sendMsg(SrvMethod.genRandom, strLen)
  }


  verifyUserPIN(certId: CertId, pin: string): Observable<boolean> {
    return this.sendMsg(SrvMethod.verifyUserPIN, [certId, pin]).pipe(
      map(ret => ret === 'true' ? true : false),
    )
  }


  verifySignedData(cert: Cert, plain: PlainText, enc: EncodedText) {
    return this.sendMsg(SrvMethod.verifySignedData, [cert, plain, enc]).pipe(
      map(ret => ret === 'true' ? true : false),
    )
  }


  signData(certId: CertId, plain: PlainText) {
    return this.sendMsg(SrvMethod.signData, [certId, plain])
  }


  changeUserPIN(certId: CertId, oldStr: string | number, newStr: string | number): Observable<boolean> {
    return this.sendMsg(SrvMethod.changeUserPIN, [certId, oldStr, newStr]).pipe(
      map(ret => ret === 'true' ? true : false),
    )
  }


  getUserPINRetryCount(certId: CertId): Observable<number> {
    return this.sendMsg(SrvMethod.getUserPINRetryCount, certId).pipe(
      map(ret => +ret),
    )
  }

  /* -------- private --------------- */


  private sendMsg(methodName: WsSendData['xtx_func_name'], args?: SendArgs): Observable<string> {
    const ret$ = <Observable<string>> Observable.create((obv: Observer<string>) => {
      const data = this.parseSendOpts(methodName, args)
      const id: MsgId = +data.call_cmd_id
      const req$ = this.subject.pipe(
        filter(ev => ev && ev.action === Actions.wsRecv && ev.msgId && ev.msgId === id ? true : false),
        map(ev => ev.payload ? ev.payload.retVal : ''),
        take(1),
        timeout(1000 * 60 * 10),
      )

      if (this.wsSubject) {
        this.wsSubject.send(data)
        this.subject.next({
          ...initialWsEvent,
          action: Actions.wsSend,
          msgId: id,
        })
      }
      else {
        this.subject.next({
          ...initialWsEvent,
          action: Actions.wsNoneAvailable,
        })
        throw new Error(Actions.wsNoneAvailable)
      }

      const sub = req$.pipe(
        take(1),
      )
        .subscribe(
          str => obv.next(str),
          err => obv.error(err),
          () => obv.complete(),
      )
      return () => sub.unsubscribe()
    })

    return ret$
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
    event.action = Actions.wsRecv
    this.subject.next(event)
  }


  private parseSendOpts(methodName: string, args?: SendArgs): WsSendData {
    globalMsgId += 1
    if (! Number.isSafeInteger(globalMsgId)) {
      globalMsgId = 1
    }
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
        this.keppAliveSub = timer(0, intv)
          .pipe(
            switchMap(() => this.getVersion()),
        )
          .subscribe()
      }
      else {
        this.getVersion().subscribe()
      }
    }
  }

} // END of class


export function init(options?: InitialWsOpts): Bjca {
  return new Bjca(options)
}
