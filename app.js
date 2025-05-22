import axios from "axios";
import qs from "qs";
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
    const isNetworkError = !error.response && (error.code && ['ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'].includes(error.code));
    const isServerError = error.response && error.response.status >= 500;
    
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
        console.log(`客户端错误 (状态码: ${error.response.status})，请求 ${error.config?.url || ''} 不进行重试。`);
        return false;
    }

    if (isNetworkError || isServerError) {
        console.log(`检测到网络错误或服务器错误，将对请求 ${error.config?.url || ''} 进行重试。`);
        return true;
    }
    
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

// 填入4KSJ账号对应Cookie
let cookieSJ = process.env["SJCOOKIE"];

// 更新 cookie 中 will_timelogout_XXXXXX 的值为当前时间戳加一天
function updateCookieLogoutTimePlusOneDay(cookieStr) {
    if (!cookieStr) return cookieStr; 
    const oneDayInSeconds = 24 * 60 * 60;
    const timestampPlusOneDay = Math.floor(Date.now() / 1000) + oneDayInSeconds;
    return cookieStr.replace(/(will_timelogout_\d+=)\d+/, `$1${timestampPlusOneDay}`);
}

cookieSJ = updateCookieLogoutTimePlusOneDay(cookieSJ);

const SJUrl = "https://www.4ksj.com/";

const SJUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";

const SJHeaders = {
    cookie: cookieSJ ?? "", 
    "User-Agent": SJUserAgent,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
};

class HostInfo {
    name;
    url;
    header;
    status; 
    formHash;
    message; 
    userName; // 新增：用于存储用户名

    constructor(name, url, header) {
        this.name = name;
        this.url = url;
        this.header = header;
        this.status = false; 
        this.message = "操作未开始";
        this.userName = ""; // 初始化用户名
    }
}

async function getFormHashSJ(host) {
    console.log(`[${host.name}] 开始获取 formhash...`);
    try {
        const response = await axios.get(host.url + 'qiandao.php', {
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "utf-8"); 
        const $ = cheerio.load(gb);
        const userNameText = $('.nexmemberintels>h5').text().replace(/\s+/g, ' ').trim(); 

        if (!userNameText) { 
            console.error(`[${host.name}] 获取用户信息失败，可能是 cookie 失效。`);
            host.status = false;
            host.message = "获取用户信息失败，Cookie可能已失效！";
            return; 
        }
        
        host.userName = userNameText; // 存储用户名
        // console.log(`[${host.name}] 获取用户信息成功！用户名: ${host.userName}`); // 移除控制台打印用户名
        
        const formHash = $('#scbar_form input[name="formhash"]').val() || $('#scbar_form input:nth-child(2)').val(); 
        
        if (!formHash) {
            console.error(`[${host.name}] 未能获取到 formhash。`);
            host.status = false;
            host.message = "未能获取到 formhash。";
            return;
        }

        host.formHash = formHash;
        // console.log(`[${host.name}] 获取 formhash 成功: ${formHash}`);
        await checkinSJ(host);

    } catch (error) {
        host.status = false;
        host.message = `[${host.name}] 获取 formhash 出错: ${error.message}`;
        console.error(`[${host.name}] 获取 formhash 过程中发生错误:`, error);
    }
}

async function checkinSJ(host) {
    const checkInUrl = host.url + "qiandao.php?sign=" + host.formHash; 
    // console.log(`[${host.name}] 开始签到，URL: ${checkInUrl}`); 
    try {
        const response = await axios.get(checkInUrl, {
            headers: host.header,
            responseType: "arraybuffer",
        });
        const responseText = iconv.decode(response.data, "GBK"); 
        const $ = cheerio.load(responseText);
        const msg = $('#messagetext>p').text().trim(); 

        if (msg) {
            host.message = msg; // 初始消息为签到结果
            console.log(`[${host.name}] 签到操作返回信息: ${msg}`);
            if (msg.includes("签到成功") || msg.includes("已签过到") || msg.includes("已签到")) { 
                 host.status = true; 
            }
        } else {
            console.warn(`[${host.name}] 未获取到明确的签到结果信息，请检查页面结构。`);
            host.message = "未获取到明确的签到结果信息。";
        }
        await getCheckinInfoSJ(host); // 获取并附加详细签到信息（包括用户名）

    } catch (error) {
        console.error(`[${host.name}] 签到出错或超时:`, error);
        host.status = false;
        host.message = `签到出错或超时: ${error.message}`;
    }
}

async function getCheckinInfoSJ(host) {
    console.log(`[${host.name}] 开始获取签到详细信息...`);
    try {
        const response = await axios.get(host.url + 'qiandao.php', { 
            headers: host.header,
            responseType: "arraybuffer",
        });
        const gb = iconv.decode(response.data, "GBK"); 
        const $ = cheerio.load(gb);
        
        const rawMonth = $('#wp > .ct2 > .sd div:nth-child(2) .xl1 li:nth-child(2):eq(0)').text().trim();
        const rawCtu = $('#wp > .ct2 > .sd div:nth-child(2) .xl1 li:nth-child(3):eq(0)').text().trim();
        const rawTotal = $('#wp > .ct2 > .sd div:nth-child(2) .xl1 li:nth-child(4):eq(0)').text().trim();
        const rawTotalPrice = $('#wp > .ct2 > .sd div:nth-child(2) .xl1 li:nth-child(5):eq(0)').text().trim();
        const rawPrice = $('#wp > .ct2 > .sd div:nth-child(2) .xl1 li:nth-child(6):eq(0)').text().trim();
      
        let initialMessage = host.message || ""; 
        if (typeof initialMessage === 'string' && initialMessage.length > 0 && !initialMessage.match(/[。！？]$/)) {
             initialMessage += '。';
        }

        let additionalInfoParts = [];
        if (host.userName) {
            additionalInfoParts.push(`用户名: ${host.userName}`);
        }

        let detailStrings = [];
        // Use the text directly from the original selectors if they are not empty
        // These texts might already contain labels like "本月打卡: 10" or just "10"
        // The original script simply concatenated them.
        if (rawMonth) detailStrings.push(rawMonth);
        if (rawCtu) detailStrings.push(rawCtu);
        if (rawTotal) detailStrings.push(rawTotal);
        if (rawTotalPrice) detailStrings.push(rawTotalPrice);
        if (rawPrice) detailStrings.push(rawPrice);

        if (detailStrings.length > 0) {
            additionalInfoParts.push(detailStrings.join('; '));
        }

        if (additionalInfoParts.length > 0) {
            host.message = `${initialMessage} ${additionalInfoParts.join('; ')}`.trim();
        } else {
            host.message = initialMessage.trim(); 
        }
        
        host.message = host.message.replace(/\s*;\s*$/, "").trim(); 
        if (host.message && !host.message.match(/[。！？]$/)) { 
            host.message += '。';
        }
        if (!host.message) {
            host.message = "签到信息获取不完整。"; 
        }

        // console.log(`[${host.name}] 获取签到信息成功: ${host.message}`); 
    } catch (error) {
        const errorMsg = `获取签到信息出错: ${error.message}`;
        host.message = (host.message || "") + ` (${errorMsg})`; 
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
        "desp": info.replace(/\*\*/g, '*') 
                   .replace(/\*/g, '-') 
    }));
    console.log("Server酱 推送请求已发送。");
}

async function sendPushPlusMsg(status, info) {
    console.log("尝试通过 PushPlus 推送...");
    await axios.post("http://www.pushplus.plus/send", {
        'token': token,
        'title': status,
        'content': info, 
        'template': 'markdown' 
    });
    console.log("PushPlus 推送请求已发送。");
}

async function sendPushDeerMsg(status, info) {
    console.log("尝试通过 PushDeer 推送...");
    await axios.post("https://api2.pushdeer.com/message/push", {
        'pushkey': pushDeer,
        'type': 'markdown', 
        'text': status, 
        'desp': info 
    });
    console.log("PushDeer 推送请求已发送。");
}

async function sendBarkMsg(status, info) {
    console.log("尝试通过 Bark 推送...");
    const title = encodeURIComponent(status);
    const plainInfo = info.replace(/\*\*/g, '').replace(/\*/g, '');
    const message = encodeURIComponent(plainInfo);
    const barkRealServer = barkServer ? barkServer : "https://api.day.app";
    const barkUrl = `${barkRealServer}/${barkKey}/${title}/${message}?group=Checkin`; 
    await axios.get(barkUrl);
    console.log("Bark 推送请求已发送。");
}

async function sendTelegramMsg(status, info) {
    console.log("尝试通过 Telegram 推送...");
    const escapeMarkdownV2 = (text) => {
        if (!text) return '';
        const escapeChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
        return text.replace(new RegExp(`[\\${escapeChars.join('\\')}]`, 'g'), '\\$&');
    };
    
    let formattedInfo = info ? info.replace(/\*\*(.*?)\*\*/g, '*$1*') : ''; 
    formattedInfo = formattedInfo.replace(/(?<!\*)\*(?!\*)/g, '-'); 
    
    const text = `*${escapeMarkdownV2(status)}*\n\n${escapeMarkdownV2(formattedInfo)}`;

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

    if (cookieSJ) {
        atLeastOneCheckinAttempted = true;
        let sj = new HostInfo("4K视界", SJUrl, SJHeaders);
        await getFormHashSJ(sj); 
        overallStatusSummary.push(`${sj.name}: ${sj.status ? '成功' : '失败'}`);
        overallMessageDetails.push(`**${sj.name}**: ${sj.message}`); 
    } else {
        console.log("[4K视界] 未配置 SJCOOKIE，跳过签到。");
        overallStatusSummary.push("4K视界: 未配置Cookie"); 
        overallMessageDetails.push("**4K视界**: 未配置Cookie，跳过。");
        
        if (!atLeastOneCheckinAttempted) { 
             const noServiceMsg = "4K视界 Cookie (SJCOOKIE) 未配置，无法执行签到。";
             console.log(noServiceMsg);
             pushNotice("签到任务未执行", noServiceMsg);
             return;
        }
    }
    
    const finalStatus = "签到结果: " + overallStatusSummary.join('; ');
    const finalMessage = overallMessageDetails.join('\n\n');

    console.log("\n--- 最终结果 ---");
    console.log(finalStatus);
    console.log(finalMessage.replace(/\*\*/g, '').replace(/\*/g, '')); 
    console.log("------------------");

    pushNotice(finalStatus, finalMessage);
    console.log("脚本运行结束:", new Date().toLocaleString());
}

main().catch(error => {
    console.error("脚本主函数发生未捕获错误:", error);
    pushNotice("签到脚本发生严重错误", `错误信息: ${error.message}\n请检查日志。`);
});
