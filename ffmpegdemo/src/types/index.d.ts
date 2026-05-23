/**
 * 接口返回类型
 * ok 成功与否
 * data 接口数据
 * msg 错误信息
 */
interface IResponse {
  ok: boolean
  data: any
  msg: string
  [key: string]: any
}
/**
 * 登录用户信息
 * id 用户id
 * token 用户token
 * username 用户名
 */
interface IUserInfo {
  id: string
  token: string
  username: string
}
