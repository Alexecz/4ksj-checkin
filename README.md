# 4ksj-checkin

2025/05/22 优化错误重试，只在0点运行一次。

#### 脚本功能：

1、通过Github Action自动定时运行 app.js 脚本。

2、通过cookies自动登录（[https://www.4ksj.com/](https://www.4ksj.com/))，脚本会自动进行签到。

3、可以通过“推送加” （[http://www.pushplus.plus](http://www.pushplus.plus))，自动发通知到微信上。

4、可以通过“PushDeer” （[http://www.pushdeer.com](http://www.pushdeer.com))，自动推送到手机上。 请使用**官方在线版**。 

5、可以通过“Server酱”（[https://sct.ftqq.com/](https://sct.ftqq.com/))，自动发通知到微信上。

6、可以通过“bark”（[https://github.com/Finb/Bark](https://github.com/Finb/Bark))，自动发通知到ios上。


#### 使用教程：

1. 先**“Fork”**本仓库。（不需要修改任何文件！）

2. 注册或登录4ksj后获取cookies。**（简单获取方法：用下面的浏览器插件直接获取）**。

### 建议提取 cookie 用该浏览器插件复制  把**cookie列表**先勾上 > 然后点击**cookie列表** > 直接点**copy all**  （自己复制的cookie会有问题！）

https://chromewebstore.google.com/detail/header-cookie-qrcode-case/echlhpliefhchnkmiomfpdnehakfmpfl

3. 在自己的仓库“Settings”里根据需要创建**“Secrets => Actions => New repository secret”**， （不开启通知，只需要创建一个SJCOOKIE即可）

   分别添加：
   - SJCOOKIE （**必填**； **填写4K视界的cookie**）
   - PPTOKEN （填写推送加的token, 不开启不用填）
   - PDKEY （填写PushDeer的key, 不开启不用填）
   - SCKEY （填写server酱sckey，不开启server酱则不用填）
   - BARKKEY (填写bark的key，不开启bark推送则不用填，默认使用官方服务器发送，如需自定义请通过BARKSERVER配置)
   - BARKSERVER (填写bark的服务器地址，不开启bark推送则不用填)
   - TELEGRAM_TOKEN（填写Telegram bot的Token）
   - TELEGRAM_ID (填写通过访问 https://api.telegram.org/bot<TELEGRAM_TOKEN>/getUpdates 获取的chat id)

4. 以上设置完毕后**需要开启Acitons**，每天0点会自动触发，并会执行自动签到（可自行改时间）。


