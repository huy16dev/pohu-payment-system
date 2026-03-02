const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
// Khởi tạo WebSocket Server đính kèm vào HTTP Server
const wss = new WebSocket.Server({ server });

// [TAI TRÁI]: CHỜ MÁY C# KẾT NỐI VÀO
let wpfClients = [];
wss.on('connection', (ws) => {
    console.log('Một máy PhotoBooth (WPF) vừa kết nối!');
    wpfClients.push(ws);
    
    ws.on('message', (message) => {
        console.log(`Nhận từ WPF: ${message}`);
    });

    ws.on('close', () => {
        wpfClients = wpfClients.filter(client => client !== ws);
        console.log('Máy PhotoBooth đã ngắt kết nối.');
    });
});

// [TAI PHẢI]: CHỜ MÁY PYTHON BÁO API CÓ TIỀN
app.post('/api/payment', (req, res) => {
    const data = req.body;
    console.log('Nhận SMS từ Python: ', data);
    
    // Giả sử cứ nhận API là báo Thành Công xuống tất cả các máy C#
    const successMsg = JSON.stringify({ action: "payment_success" });
    
    wpfClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(successMsg);
        }
    });
    
    res.json({ message: "Đã báo C# thành công!" });
});

// Render.com sẽ cấp ngẫu nhiên 1 cái PORT vào biến môi trường process.env.PORT
const PORT = process.env.PORT || 8766;
server.listen(PORT, () => {
    console.log(`Server đang chạy rầm rập ở PORT ${PORT}`);
});
