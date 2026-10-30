require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.static(path.join(__dirname, '')));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// SQL Server配置
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // 使用加密連線
    trustServerCertificate: true
  }
};

// 連接
const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

// 處理訂單
app.post('/reservation', async (req, res) => {
  try {
    await poolConnect;

    const { name, contactPhone, email, checkIn, checkOut, guests, roomNumber, bank, accountNumber } = req.body;

    // 在 Guests 表中插入客户資訊
    const guestResult = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('contactPhone', sql.NVarChar, contactPhone)
      .input('email', sql.NVarChar, email)
      .query('INSERT INTO Guests (name, contact_phone, email) OUTPUT INSERTED.guest_id VALUES (@name, @contactPhone, @email);');

    // 獲取客户ID
    const guestId = guestResult.recordset[0].guest_id;

    // 在 Reservations 表中插入訂單
    const reservationResult = await pool.request()
      .input('checkIn', sql.Date, checkIn)
      .input('checkOut', sql.Date, checkOut)
      .input('guestsCount', sql.Int, guests)
      .input('roomNumber', sql.Int, roomNumber)
      .input('guestId', sql.Int, guestId)
      .input('totalPrice', sql.Decimal(10, 2), calculateTotalPrice(roomNumber, checkIn, checkOut))
      .input('bank', sql.NVarChar, bank)
      .input('accountNumber', sql.NVarChar, accountNumber)
      .query('INSERT INTO Reservations (check_in_date, check_out_date, guests_count, room_number, guest_id, total_price, bank, account_number) OUTPUT INSERTED.reservation_id VALUES (@checkIn, @checkOut, @guestsCount, @roomNumber, @guestId, @totalPrice, @bank, @accountNumber);');

    const reservationId = reservationResult.recordset[0].reservation_id;
    
    // 預定成功，切到成功頁面
    res.redirect('/reservation-success.html?reservationId=' + reservationId);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 處理預定成功後的頁面
app.get('/reservation-success.html', (req, res) => {
  res.sendFile(__dirname + '/reservation-success.html');
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/2rooms.html', (req, res) => {
  res.sendFile(path.join(__dirname, '2rooms.html'));
});

app.get('/3facilities.html', (req, res) => {
  res.sendFile(path.join(__dirname, '3facilities.html'));
});

app.get('/4reservation.html', (req, res) => {
  res.sendFile(path.join(__dirname, '4reservation.html'));
});

app.get('/5contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, '5contact.html'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/image', (req, res) => {
  res.sendFile(path.join(__dirname, 'image'));
});

// 計算總價
function calculateTotalPrice(roomNumber, checkIn, checkOut) {
  const roomCost = (roomNumber === '301' || roomNumber === '302' || roomNumber === '304') ? 9000 : 10000;
  const numberOfNights = (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24);
  return roomCost * numberOfNights;
}

// Contact table
app.post('/contact', async (req, res) => {
  try {
    await poolConnect;

    const { name, email, message } = req.body;

    // 把資訊插入到 Contact 表中
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('message', sql.Text, message)
      .query('INSERT INTO Contact (name, email, message) VALUES (@name, @email, @message);');

    // 成功後切換到 contact-success.html
    res.redirect('/contact-success.html');
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  } finally {
    sql.close();
  }
});


// 設置body-parser以解析POST請求
app.use(bodyParser.urlencoded({ extended: true }));

// 連線到資料庫
sql.connect(config, (err) => {
  if (err) {
    console.error('連線失敗: ' + err.stack);
    return;
  }
  console.log('連線成功');
});

// 處理POST請求
app.post('/search', (req, res) => {
  const searchPhone = req.body['search-phone'];
  const searchEmail = req.body['search-email'];

  // 尋找符合條件的訂單
  const request = new sql.Request();
  const query = `SELECT *
  FROM Guests
  JOIN Reservations ON Guests.guest_id = Reservations.guest_id 
  WHERE Guests.contact_phone='${searchPhone}' AND Guests.email='${searchEmail}'`;

  request.query(query, (err, result) => {
    if (err) throw err;

    // 顯示搜尋結果
    if (result.recordset.length > 0) {
      res.send(`
        <h2>Search Results:</h2>
        <p>訂單於<b>入住前三天內</b>即無法修改訂單內容，若須修改請先刪除原始訂單後再次下單，謝謝您的配合。</p>
        <p>付款狀態每日更新一次~</p>
        <table border='1'>
        <tr><th>Name</th><th>Contact Phone</th><th>Email</th><th>Check-in Date</th><th>Check-out Date</th><th>Room Number</th><th>Total Price</th><th>Bank</th><th>Account Number</th><th>付款狀態</th><th>修改</th><th>刪除</th></tr>
        ${result.recordset.map(row => `
            <tr>
              <td>${row.name}</td>
              <td>${row.contact_phone}</td>
              <td>${row.email}</td>
              <td>${row.check_in_date}</td>
              <td>${row.check_out_date}</td>
              <td>${row.room_number}</td>
              <td>${row.total_price}</td>
              <td>${row.bank}</td>
              <td>${row.account_number}</td>
              <td>${row.payment_status}</td>
              <td><a href='/edit/${row.reservation_id}'>Edit</a></td>
              <td><a href='/delete/${row.reservation_id}'>Delete</a></td>
            </tr>`).join('')}
        </table>
        <p> </p>
        <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
        <p>若有其他需求與問題請與客服聯絡，謝謝您。</p>
        <p>Service time: Mon-Fri 09:00-17:00</p>
        <p>客服電話：(02)2905-3030</p>
        <p>shininghotel@gmail.com</p>

      `);
    } else {
      res.send(`
      <h2>No records found.</h2>
      <p> </p>
      <p> </p>
      <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
      <p> </p>
      <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
      `);
    }
  });
});

// 編輯
app.get('/edit/:id', (req, res) => {
  const reservationId = req.params.id;

  // 根據ID查找訂單
  const request = new sql.Request();
  const query = `SELECT * FROM Reservations WHERE reservation_id = ${reservationId}`;

  request.query(query, (err, result) => {
    if (err) throw err;

    // 找紀錄
    if (result.recordset.length > 0) {
      const reservation = result.recordset[0];
      const checkInDate = reservation.check_in_date.toISOString().split('T')[0];
      const checkOutDate = reservation.check_out_date.toISOString().split('T')[0];
      const currentDate = new Date().toISOString().split('T')[0];
      const minCheckInDate = getMinCheckInDate(currentDate);

      // 修改、刪除
      const isWithinModificationRange = checkInDate > minCheckInDate;

      res.send(`
      <h2>Edit Reservation:</h2>
      ${isWithinModificationRange ? '' : '<p>此預定已超過時間限制無法修改，可直接刪除後再次下訂單，若有其他問題請聯繫客服協助處裡，謝謝。</p>'}
      <form action='/update/${reservationId}' method='post'>
        <table>
          <tr>
            <td><label>Check-in date:</label></td>
            <td><input type='date' name='check-in' value='${checkInDate}' min='${currentDate}' required></td>
          </tr>
          <tr>
            <td><label>Check-out date:</label></td>
            <td><input type='date' name='check-out' value='${checkOutDate}' min='${getNextDay(currentDate)}' required></td>
          </tr>
          <tr>
            <td><label>Room number:</label></td>
            <td><input type='number' name='room-number' value='${reservation.room_number}' required min='301' max='305'></td>
          </tr>
          <tr>
            <td><label>Bank 銀行代碼:</label></td>
            <td><input type='number' name='bank' value='${reservation.bank}' required min='000' max='999'></td>
          </tr>
          <tr>
            <td><label>轉帳帳戶後五碼:</label></td>
            <td><input type='number' name='account-number' value='${reservation.account_number}' required min='00000' max='99999'></td>
          </tr>
        </table>
        
        <br>
        
        ${isWithinModificationRange ? '<button type="submit">Update Reservation</button>' : ''}      
        ${isWithinModificationRange ? '' : '<p>Service time: Mon-Fri 09:00-17:00</p><p>客服電話：(02)2905-3030</p><p>shininghotel@gmail.com</p>'}
        
      </form>
    `);
    
    } else {
      res.send(`
      <h2>Record not found.</h2>
      <p> </p>
      <p> </p>
      <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
      <p> </p>
      <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
      `);
    }
  });
});

function getNextDay(currentDate) {
  const nextDay = new Date(currentDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.toISOString().split('T')[0];
}

function getMinCheckInDate(currentDate) {
  const minCheckInDate = new Date(currentDate);
  minCheckInDate.setDate(minCheckInDate.getDate() + 3); 
  return minCheckInDate.toISOString().split('T')[0];
}


app.post('/update/:id', (req, res) => {
  const reservationId = req.params.id;
  const updatedCheckIn = req.body['check-in'];
  const updatedCheckOut = req.body['check-out'];
  const updatedRoomNumber = req.body['room-number'];
  const updatedBank = req.body['bank'];
  const updatedAccountNumber = req.body['account-number'];

  // 計算總額
  const pricing = {
    '301': 9000,
    '302': 9000,
    '303': 10000,
    '304': 9000,
    '305': 10000,
  };

  const numberOfDays = Math.ceil((new Date(updatedCheckOut) - new Date(updatedCheckIn)) / (1000 * 60 * 60 * 24));
  const updatedTotalPrice = numberOfDays * pricing[updatedRoomNumber];

  // 資料庫更新
  const updateQuery = `
    UPDATE Reservations
    SET check_in_date='${updatedCheckIn}',
        check_out_date='${updatedCheckOut}',
        room_number=${updatedRoomNumber},
        total_price=${updatedTotalPrice},
        bank=${updatedBank},
        account_number=${updatedAccountNumber}
    WHERE reservation_id = ${reservationId}
  `;

  const request = new sql.Request();

  request.query(updateQuery, (err, result) => {
    if (err) throw err;

    // 檢查影響（表示更新成功）
    if (result.rowsAffected[0] > 0) {
      const selectQuery = `SELECT * FROM Reservations WHERE reservation_id = ${reservationId}`;

      request.query(selectQuery, (selectErr, selectResult) => {
        if (selectErr) throw selectErr;

        if (selectResult.recordset.length > 0) {
          const updatedReservation = selectResult.recordset[0];

          res.send(`
            <h1>Reservation updated successfully.</h1>
            <h2>更新預約訂單資訊為:</h2>
            <p><b>Check-in date:</b></p>
            <p>${updatedReservation.check_in_date}</p>
            <p><b>Check-out date:</b></p>
            <p>${updatedReservation.check_out_date}</p>
            <p><b>Room number:</b></p>
            <p>${updatedReservation.room_number}</p>
            <p><b>Bank 轉帳銀行代碼:</b></p>
            <p>${updatedReservation.bank}</p>
            <p><b>Account number 轉帳帳號後五碼:</b></p>
            <p>${updatedReservation.account_number}</p>
            <p><b>Total price:</b></p>
            <p>${updatedReservation.total_price}</p>
          
            <p> </p>
            <p> </p>
            <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
            <p> </p>
            <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
          `);
        } else {
          res.send(`
          <h2>Record not found after update.</h2>
          <p> </p>
          <p> </p>
          <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
          <p> </p>
          <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
          `);
        }
      });
    } else {
      res.send(`
      <h2>Record not found or could not be updated.</h2>
      <p> </p>
      <p> </p>
      <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
      <p> </p>
      <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
      `);
    }
  });
});


// 刪除功能
app.get('/delete/:id', (req, res) => {
    const reservationId = req.params.id;
  
    const deleteQuery = `DELETE FROM Reservations WHERE reservation_id = ${reservationId}`;
    const request = new sql.Request();
  
    request.query(deleteQuery, (err, result) => {
      if (err) throw err;
  
      // 檢查影響（表示刪除成功）
      if (result.rowsAffected[0] > 0) {
        res.send(`
        <h2>Record deleted successfully.</h2>
        <p> </p>
        <p> </p>
        <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
        <p> </p>
        <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
        `);
      } else {
        res.send(`
        <h2>Record not found or could not be deleted.</h2>
        <p> </p>
        <p> </p>
        <button onclick="window.location.href='/reservation-success.html'">Back to Search</button>
        <p> </p>
        <button onclick="window.location.href='/'">Back to Shining Hotel Homepage</button>
        `);
      }
    });
  });
  
// 啟動server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
