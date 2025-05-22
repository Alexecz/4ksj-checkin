import axios from "axios";
import qs from "qs";
import xmlJs from "xml-js";
import iconv from "iconv-lite";
import * as cheerio from 'cheerio';
import axiosRetry from 'axios-retry'; // 新增：导入 axios-retry

// 新增：配置 axios-retry
axiosRetry(axios, {
  retries: 3, // 设置重试次数 (不包括首次请求)
  retryDelay: (retryCount, error) => {
    console.log(`请求 ${error.config?.url || ''} 失败 (状态码: ${error.response?.status || 'N/A'})，正在进行第 ${retryCount} 次重试。错误信息: ${error.message}`);
    return retryCount * 2000; // 每次重试的延迟时间，例如：2s, 4s, 6s
  },
  retryCondition: (error) => {
    // 配置重试的条件
    // 检查是否是网络错误 (例如 DNS 解析失败, TCP 连接超时/重置等)
    // 这些错误通常没有 error.response 对象
    const isNetworkError = !error.response && (error.code && ['ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'].includes(error.code));
    
    // 检查是否是服务器端错误 (5xx 状态码)
    const isServerError = error.response && error.response.status >= 500;
    
    // 客户端错误 (4xx 状态码) 通常不应该重试，因为它们通常表示请求本身有问题
    // (例如，无效的凭据、错误的URL、权限不足等)，重试不太可能成功。
    // 特别是对于签到脚本，401/403 通常意味着 cookie 失效。
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
        console.log(`客户端错误 (状态码: ${error.response.status})，请求 ${error.config?.url || ''} 不进行重试。`);
        return false;
    }

    // 如果是网络错误或服务器错误，则进行重试
    if (isNetworkError || isServerError) {
        console.log(`检测到网络错误或服务器错误，将对请求 ${error.config?.url || ''} 进行重试。`);
        return true;
    }
    
    // 其他类型的错误默认不重试
    return false;
  }
});

// 填写Telegram的Bot API和Chat ID
const telegramToken = process.env.TELEGRAM_TOKEN
const telegramID = process.env.TELEGRAM_ID

// 填写server酱sckey,不开启server酱则不用填
const sckey = process.env["SCKEY"];

// 填写pushplus的token,不开启pushplus则不用填
const token = process.env["PPTOKEN"];

// 填写PushDeer的key, 不开启不用填
const pushDeer = process.env["PDKEY"]

// 填写Bark的key, 不开启不用填
const barkKey = process.env["BARKKEY"]

// 填写Bark的服务器地址, 不开启不用填
const barkServer = process.env["BARKSERVER"]

//配置需要打开的服务信息,hao4k 和 4ksj，未配置只对hao4k
// const needCheckHost = process.env["CHECKHOST"]
const needCheckHost = '4ksj' // 如果希望从环境变量读取，请取消注释上一行，并注释此行

// 填入Hao4k账号对应cookie
let cookie = process.env["COOKIE"];


// 填入4KSJ账号对应Cookie
let cookieSJ = process.env["SJCOOKIE"];

// 更新 cookie 中 will_timelogout_XXXXXX 的值为当前时间戳加一天
function updateCookieLogoutTimePlusOneDay(cookieStr) {
    if (!cookieStr) return cookieStr; // 如果 cookie 为空，直接返回
    const oneDayInSeconds = 24 * 60 * 60;
    const timestampPlusOneDay = Math.floor(Date.now() / 1000) + oneDayInSeconds;
    return cookieStr.replace(/(will_timelogout_\d+=)\d+/, `$1${timestampPlusOneDay}`);
}

cookieSJ = updateCookieLogoutTimePlusOneDay(cookieSJ);



const SJUrl =
    "https://www.4ksj.com/";
const hao4kUrl =
    "https://www.hao4k.cn/qiandao/";

const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36";

const SJUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";

const headers = {
    cookie: cookie ?? "",
    "User-Agent": userAgent,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
};

const SJHeaders = {
    cookie: cookieSJ ?? cookie, // 如果 SJCOOKIE 未设置，则回退到使用 hao4k 的 cookie (原逻辑)
    "User-Agent": SJUserAgent,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
};

class HostInfo {
    name;
    url;
    header;
    status; // true: 成功, false: 失败
    formHash;
    message; // 用于存储签到结果或错误信息

    constructor(name, url, header) {
        this.name = name;
        this.url = url;
        this.header = header;
        this.status = false; // 初始化为失败
        this.message = "操作未开始";
    }
}

async function getFormHashSJ(host) {
    console.log(`[${host.name}] 开始获取 formhash...`);
    try {
        const response = await axios.get(host.url + 'qiandao.php', {
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "utf-8"); // 4ksj 通常是 utf-8 或 gbk，根据实际情况调整
        const $ = cheerio.load(gb);
        const userName = $('.nexmemberintels>h5').text().replace(/\s+/g, ' ').trim(); // 移除多余空白

        if (!userName) { // 更稳健的检查
            console.error(`[${host.name}] 获取用户信息失败，可能是 cookie 失效。`);
            host.status = false;
            host.message = "获取用户信息失败，Cookie可能已失效！";
            return; // 提前返回
        }
        
        console.log(`[${host.name}] 获取用户信息成功！用户名: ${userName}`);
        const formHash = $('#scbar_form input[name="formhash"]').val() || $('#scbar_form input:nth-child(2)').val(); // 尝试更精确的选择器
        
        if (!formHash) {
            console.error(`[${host.name}] 未能获取到 formhash。`);
            host.status = false;
            host.message = "未能获取到 formhash。";
            return;
        }

        host.formHash = formHash;
        console.log(`[${host.name}] 获取 formhash 成功: ${formHash}`);
        await checkinSJ(host);

    } catch (error) {
        host.status = false;
        host.message = `[${host.name}] 获取 formhash 出错: ${error.message}`;
        console.error(`[${host.name}] 获取 formhash 过程中发生错误:`, error);
    }
}

async function getFormHash(host) {
    console.log(`[${host.name}] 开始获取 formhash...`);
    try {
        const response = await axios.get(host.url, { // hao4k 的签到页面就是其 baseUrl
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "gb2312");
        const $ = cheerio.load(gb);
        const userName = $('#mumucms_username').text().trim();

        if (userName === '') {
            console.error(`[${host.name}] 获取用户信息失败，可能是 cookie 失效。`);
            host.status = false;
            host.message = "获取用户信息失败，Cookie可能已失效！";
            return;
        }

        console.log(`[${host.name}] 获取用户信息成功！用户名: ${userName}`);
        // 尝试通过 name 属性获取 formhash，如果失败则回退到原来的索引方式
        let formHash = $('#scbar_form input[name="formhash"]').val();
        if (!formHash) {
            formHash = $('#scbar_form input').eq(1).val(); // 原来的逻辑
        }
        
        if (!formHash) {
            console.error(`[${host.name}] 未能获取到 formhash。`);
            host.status = false;
            host.message = "未能获取到 formhash。";
            return;
        }
        host.formHash = formHash;
        console.log(`[${host.name}] 获取 formhash 成功: ${formHash}`);
        await checkin(host);

    } catch (error) {
        host.status = false;
        host.message = `[${host.name}] 获取 formhash 出错: ${error.message}`;
        console.error(`[${host.name}] 获取 formhash 过程中发生错误:`, error);
    }
}

async function checkinSJ(host) {
    const checkInUrl = host.url + "qiandao.php?sign=" + host.formHash; // 4ksj 的签到 URL 结构
    console.log(`[${host.name}] 开始签到，URL: ${checkInUrl}`);
    try {
        const response = await axios.get(checkInUrl, {
            headers: host.header,
            responseType: "arraybuffer",
        });
        // 4ksj 签到后的页面编码可能是 GBK 或 UTF-8，需要根据实际情况调整
        const responseText = iconv.decode(response.data, "GBK"); // 假设是 GBK
        const $ = cheerio.load(responseText);
        const msg = $('#messagetext>p').text().trim(); // 获取签到结果信息

        if (msg) {
            host.message = msg;
            console.log(`[${host.name}] 签到操作返回信息: ${msg}`);
            if (msg.includes("签到成功") || msg.includes("已签过到") || msg.includes("已签到")) { // 根据实际成功信息调整
                 host.status = true; // 标记为成功状态
            } else {
                // 如果消息不明确表示成功，可以考虑标记为失败或进一步分析
                // host.status = false; // 保持默认的 false 或根据情况设置
            }
        } else {
            // 如果没有明确的消息，可能需要检查页面其他元素或HTTP状态码
            // 有些网站签到成功后会直接跳转，response.status 可能是 200
            // 或者检查页面特定元素是否存在来判断
            console.warn(`[${host.name}] 未获取到明确的签到结果信息，请检查页面结构。`);
            host.message = "未获取到明确的签到结果信息。";
        }
        await getCheckinInfoSJ(host); // 签到后获取详细信息

    } catch (error) {
        console.error(`[${host.name}] 签到出错或超时:`, error);
        host.status = false;
        host.message = `签到出错或超时: ${error.message}`;
    }
}

async function checkin(host) {
    // hao4k 的签到 URL 结构
    const checkInUrl = `${host.url}?mod=sign&operation=qiandao&formhash=${host.formHash}&format=empty&inajax=1&ajaxtarget=`;
    console.log(`[${host.name}] 开始签到，URL: ${checkInUrl}`);
    try {
        const response = await axios.get(checkInUrl, {
            headers: host.header,
            responseType: "arraybuffer", // 响应是 XML，但先以 buffer 接收
        });
        const resUtf8 = iconv.decode(response.data, "GBK"); // hao4k 返回的是 GBK 编码的 XML
        const dataStr = xmlJs.xml2json(resUtf8, {
            compact: true,
            spaces: 4,
        });
        const data = JSON.parse(dataStr);
        const content = data?.root?._cdata;

        if (content) {
            console.log(`[${host.name}] 签到返回内容: ${content}`);
            if (content.includes("今日已签") || content.includes("签到成功")) { // 包含“签到成功”等字样也视为成功
                host.message = content; // 使用服务器返回的原始信息
            } else {
                host.message = content; // 其他情况也使用服务器信息
            }
        } else if (data?.root?.toString().includes("成功")) { // 有时 cdata 为空，但 root 节点有信息
             host.message = "签到成功（通过XML根节点判断）!";
             console.log(`[${host.name}] 签到成功（通过XML根节点判断）!`);
        }
        else {
            host.message = "签到成功（未获取到明确文本，但请求成功）!"; // 假设请求成功即签到成功
            console.log(`[${host.name}] 签到请求成功，但未获取到明确文本。`);
        }
        host.status = true; // 只要请求没出错，就认为签到操作已尝试或成功
        await getCheckinInfo(host);

    } catch (error) {
        console.error(`[${host.name}] 签到出错或超时:`, error);
        host.status = false;
        host.message = `签到出错或超时: ${error.message}`;
    }
}

async function getCheckinInfoSJ(host) {
    console.log(`[${host.name}] 开始获取签到详细信息...`);
    try {
        const response = await axios.get(host.url + 'qiandao.php', { // 再次访问签到页面获取信息
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "GBK"); // 假设是 GBK
        const $ = cheerio.load(gb);
        
        // 使用更精确和健壮的选择器
        const month = $('#wp .ct2 .sd div:contains("我的签到") + div .xl1 li:contains("本月打卡")').text().replace('本月打卡', '').trim();
        const ctu = $('#wp .ct2 .sd div:contains("我的签到") + div .xl1 li:contains("连续打卡")').text().replace('连续打卡', '').trim();
        const total = $('#wp .ct2 .sd div:contains("我的签到") + div .xl1 li:contains("累计打卡")').text().replace('累计打卡', '').trim();
        const totalPrice = $('#wp .ct2 .sd div:contains("我的签到") + div .xl1 li:contains("累计奖励")').text().replace('累计奖励', '').trim();
        const price = $('#wp .ct2 .sd div:contains("我的签到") + div .xl1 li:contains("最近奖励")').text().replace('最近奖励', '').trim();
      
        let info = `本月打卡: ${month || 'N/A'}; 连续打卡: ${ctu || 'N/A'}; 累计打卡: ${total || 'N/A'}; 累计奖励: ${totalPrice || 'N/A'}; 最近奖励: ${price || 'N/A'}`;
        host.message = (host.message.endsWith("!") || host.message.endsWith("。") ? host.message : host.message + "。") + " " + info;
        console.log(`[${host.name}] 获取签到信息成功: ${info}`);
    } catch (error) {
        const errorMsg = `获取签到信息出错: ${error.message}`;
        host.message += ` (${errorMsg})`; // 将错误附加到现有消息
        console.error(`[${host.name}] ${errorMsg}`, error);
    }
}

async function getCheckinInfo(host) {
    console.log(`[${host.name}] 开始获取签到详细信息...`);
    try {
        const response = await axios.get(host.url, { // 再次访问签到页面获取信息
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "gb2312");
        const $ = cheerio.load(gb);
        let days = $('#lxdays').val() || 'N/A'; 
        let reward = $('#lxreward').val() || 'N/A'; 
        let allDays = $('#lxtdays').val() || 'N/A'; 
        let rank = $('#qiandaobtnnum').val() || 'N/A';
        let info = `本次签到奖励: ${reward} 个币；已连续签到: ${days} 天; 今日排名: ${rank} 位；签到总天数: ${allDays} 天；`;
        host.message = (host.message.endsWith("!") || host.message.endsWith("。") ? host.message : host.message + "。") + " " + info;
        console.log(`[${host.name}] 获取签到信息成功: ${info}`);
    } catch (error) {
        const errorMsg = `获取签到信息出错: ${error.message}`;
        host.message += ` (${errorMsg})`;
        console.error(`[${host.name}] ${errorMsg}`, error);
    }
}

function pushNotice(status, message) {
    console.log("\n开始推送通知...");
    const notifications = [];
    if (sckey) {
        notifications.push(sendSCMsg(status, message).catch(e => console.error("Server酱推送失败:", e.message)));
    }
    if (token) {
        notifications.push(sendPushPlusMsg(status, message).catch(e => console.error("PushPlus推送失败:", e.message)));
    }
    if (pushDeer) {
        notifications.push(sendPushDeerMsg(status, message).catch(e => console.error("PushDeer推送失败:", e.message)));
    }
    if (barkKey) {
        notifications.push(sendBarkMsg(status, message).catch(e => console.error("Bark推送失败:", e.message)));
    }
    if (telegramToken && telegramID) {
        notifications.push(sendTelegramMsg(status, message).catch(e => console.error("Telegram推送失败:", e.message)));
    }

    if (notifications.length === 0) {
        console.log("未配置任何通知服务。");
        return;
    }

    Promise.allSettled(notifications).then(results => {
        results.forEach(result => {
            if (result.status === 'rejected') {
                // 错误已在各自的 catch 中打印
            }
        });
        console.log("所有通知推送尝试完毕。\n");
    });
}

async function sendSCMsg(status, info) {
    console.log("尝试通过 Server酱 推送...");
    const serverUrl = `https://sctapi.ftqq.com/${sckey}.send`;
    await axios.post(serverUrl, qs.stringify({
        "title": status,
        "desp": info.replace(/\*/g, '-') // Server酱 Markdown 支持有限，替换 *
    }));
    console.log("Server酱 推送请求已发送。");
}

async function sendPushPlusMsg(status, info) {
    console.log("尝试通过 PushPlus 推送...");
    await axios.post("http://www.pushplus.plus/send", {
        'token': token,
        'title': status,
        'content': info, // PushPlus 支持 HTML
        'template': 'markdown' // 或者 'html'
    });
    console.log("PushPlus 推送请求已发送。");
}

async function sendPushDeerMsg(status, info) {
    console.log("尝试通过 PushDeer 推送...");
    const message = `${status}\n\n${info}`;
    await axios.post("https://api2.pushdeer.com/message/push", {
        'pushkey': pushDeer,
        'type': 'markdown', // 或 'text'
        'text': status, // title
        'desp': info // body for markdown
    });
    console.log("PushDeer 推送请求已发送。");
}

async function sendBarkMsg(status, info) {
    console.log("尝试通过 Bark 推送...");
    const title = encodeURIComponent(status);
    const message = encodeURIComponent(info);
    const barkRealServer = barkServer ? barkServer : "https://api.day.app";
    const barkUrl = `${barkRealServer}/${barkKey}/${title}/${message}?group=Checkin`; // 添加 group 参数
    await axios.get(barkUrl);
    console.log("Bark 推送请求已发送。");
}

async function sendTelegramMsg(status, info) {
    console.log("尝试通过 Telegram 推送...");
    // Telegram MarkdownV2 需要对特殊字符进行转义
    const escapeMarkdownV2 = (text) => {
        const escapeChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
        return text.replace(new RegExp(`[\\${escapeChars.join('\\')}]`, 'g'), '\\$&');
    };
    
    let formattedInfo = info.replace(/\*/g, '-'); // 将 * 替换为 - 列表项
    // 简单的处理，更复杂的 Markdown 转换可能需要库
    formattedInfo = escapeMarkdownV2(formattedInfo);
    const text = `*${escapeMarkdownV2(status)}*\n\n${formattedInfo}`;

    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        'chat_id': telegramID,
        'text': text,
        'parse_mode': 'MarkdownV2'
    });
    console.log("Telegram 推送请求已发送。");
}

async function main() {
    console.log("脚本开始运行:", new Date().toLocaleString());
    let overallStatusSummary = [];
    let overallMessageDetails = [];
    let atLeastOneCheckinAttempted = false;

    const configuredCheckHost = (process.env.CHECKHOST || '4ksj,hao4k').toLowerCase(); // 默认检查两者

    if (configuredCheckHost.includes("4ksj")) {
        if (cookieSJ) {
            atLeastOneCheckinAttempted = true;
            let sj = new HostInfo("4K视界", SJUrl, SJHeaders);
            await getFormHashSJ(sj); // 此函数内部会调用 checkinSJ 和 getCheckinInfoSJ
            overallStatusSummary.push(`${sj.name}: ${sj.status ? '成功' : '失败'}`);
            overallMessageDetails.push(`**${sj.name}**: ${sj.message}`);
        } else {
            console.log("[4K视界] 未配置 SJCOOKIE，跳过签到。");
            overallStatusSummary.push("4K视界: 未配置Cookie");
            overallMessageDetails.push("**4K视界**: 未配置Cookie，跳过。");
        }
    }

    if (configuredCheckHost.includes("hao4k")) {
        if (cookie) {
            atLeastOneCheckinAttempted = true;
            let hao4k = new HostInfo("hao4K", hao4kUrl, headers);
            await getFormHash(hao4k); // 此函数内部会调用 checkin 和 getCheckinInfo
            overallStatusSummary.push(`${hao4k.name}: ${hao4k.status ? '成功' : '失败'}`);
            overallMessageDetails.push(`**hao4K**: ${hao4k.message}`);
        } else {
            console.log("[hao4K] 未配置 COOKIE，跳过签到。");
            overallStatusSummary.push("hao4K: 未配置Cookie");
            overallMessageDetails.push("**hao4K**: 未配置Cookie，跳过。");
        }
    }

    if (!atLeastOneCheckinAttempted) {
        const noServiceMsg = "未配置任何有效的签到服务或Cookie。";
        console.log(noServiceMsg);
        pushNotice("签到任务未执行", noServiceMsg);
        return;
    }
    
    const finalStatus = "签到结果: " + overallStatusSummary.join('; ');
    const finalMessage = overallMessageDetails.join('\n\n');

    console.log("\n--- 最终结果 ---");
    console.log(finalStatus);
    console.log(finalMessage.replace(/\*\*/g, '')); // 控制台输出时移除 Markdown 标记
    console.log("------------------");

    pushNotice(finalStatus, finalMessage);
    console.log("脚本运行结束:", new Date().toLocaleString());
}

main().catch(error => {
    console.error("脚本主函数发生未捕获错误:", error);
    pushNotice("签到脚本发生严重错误", `错误信息: ${error.message}\n请检查日志。`);
});
