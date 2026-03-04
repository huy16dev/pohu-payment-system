const express = require('express');
const cors = require('cors');
const { Server } = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8766;
const server = http.createServer(app);

// Chạy một WebSocket Server đồng thời với HTTP Webhook
const wss = new Server({ server });

// Format: { wsObject: { expected_content: "MAY01...", amount: 50000, machine: "Booth01" } }
let activeClients = new Map();

// HTTP Webhook Endpoint để thư mục Python gõ cửa
app.post('/api/payment', (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.message) {
            return res.status(400).json({ error: "Missing message body" });
        }

        const sms_body = payload.message.toUpperCase();
        console.log(`\n\x1b[36m[WEBHOOK POST] Nhận SMS thô:\x1b[0m ${sms_body.substring(0, 100).replace(/\n/g, ' ')}...`);

        // 1. Chặn Fake tin nhắn từ số điện thoại cá nhân (chỉ lấy BrandName)
        const senderRegex = /\+CMGR:\s*"[^"]*"\s*,\s*"([^"]+)"/i;
        const senderMatch = sms_body.match(senderRegex);
        const senderId = senderMatch ? senderMatch[1] : "UNKNOWN";

        if (/^[\+\d]+$/.test(senderId)) {
            console.log(`\x1b[31m[SCAM ALERT] Số cá nhân ${senderId} gửi fake bank. BOUNCE!\x1b[0m`);
            return res.status(200).json({ status: "rejected", reason: "personal_phone_spoofing" });
        }

        // 2. Bóc tiền (Chứa +50,000 VND)
        const amountRegex = /\+([\d,\.]+)\s*(?:VND|VNĐ)/;
        const amountMatch = sms_body.match(amountRegex);
        let actual_amount = 0;

        if (amountMatch) {
            actual_amount = parseInt(amountMatch[1].replace(/,/g, '').replace(/\./g, ''), 10);
        }

        let matched_flag = false;

        // 3. Rà toàn bộ Client đang đợi
        for (const [ws, info] of activeClients.entries()) {
            const expectCode = info.expected_content ? info.expected_content.toUpperCase() : null;
            const expectAmount = parseInt(info.amount) || 0;

            if (expectCode && sms_body.includes(expectCode)) {
                if (actual_amount >= expectAmount && expectAmount > 0) {
                    matched_flag = true;
                    console.log(`\x1b[32m[PAYMENT SUCCESS] Mã khớp [${expectCode}] - Nạp đủ ${actual_amount} VND. Bắn cờ mở Camera qua WS tới máy ${info.machine || 'Unknown'}\x1b[0m`);

                    // Gửi qua WebSocket
                    ws.send(JSON.stringify({ action: "payment_success", content: expectCode }));

                    // Xoá thông tin đợi 
                    info.expected_content = null;
                } else {
                    matched_flag = true;
                    console.log(`\x1b[33m[FRAUD ALERT] Mã [${expectCode}] nạp thiếu: Có ${actual_amount}đ / Đòi ${expectAmount}đ. Chặn Cửa!\x1b[0m`);
                }
            }
        }

        if (!matched_flag) {
            console.log("\x1b[90m[INFO] Không khớp với bất kỳ máy trạm nào đang đợi.\x1b[0m");
        }

        res.status(200).json({ status: "processed", matched: matched_flag });

    } catch (err) {
        console.error("Lỗi crash Webhook:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/', (req, res) => {
    res.send("<h1>Pohu Boss Render Server is up and running!</h1>");
});

// Websocket Events
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`\n\x1b[35m[WS] 💻 Có một Client trạm mới truy cập (${ip})\x1b[0m`);

    const clientState = { expected_content: null, amount: 0, machine: "Unknown" };
    activeClients.set(ws, clientState);

    ws.on('message', (messageAsString) => {
        try {
            const data = JSON.parse(messageAsString);
            if (data.action === "expect_payment") {
                clientState.expected_content = data.content;
                clientState.amount = data.amount;
                // Nếu C# gửi mã định danh máy để dễ debug (VD: data.machine)
                if (data.machine) clientState.machine = data.machine;

                console.log(`\x1b[35m[WS] ⏳ Trạm [${clientState.machine}] đăng ký đợi chuyển khoản: ${data.amount} VND cho mã [${data.content}]\x1b[0m`);
            }
        } catch (e) {
            console.log("Error parsing websocket JSON:", e);
        }
    });

    ws.on('close', () => {
        console.log(`\x1b[35m[WS] ❌ Trạm [${clientState.machine}] đã ngắt kết nối\x1b[0m`);
        activeClients.delete(ws);
    });
});

server.listen(PORT, () => {
    console.log(`\x1b[42m\x1b[30m === POHU PAYMENT BOSS SERVER KHỞI ĐỘNG === \x1b[0m`);
    console.log(`[INFO] REST/Webhook chờ hứng ở: http://localhost:${PORT}/api/payment`);
    console.log(`[INFO] Websockets chờ trạm ở : ws://localhost:${PORT}`);
    console.log(`Sẵn sàng scale nghìn máy...`);
});
