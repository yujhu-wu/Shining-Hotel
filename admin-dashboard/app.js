require('dotenv').config();
const express = require('express');
const mssql = require('mssql');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000; 

app.use(cors());
app.use(express.static(__dirname));
app.use(bodyParser.json());

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


app.post('/adminLogin', async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await mssql.connect(config);

    // 查詢資料庫，驗證管理員
    const result = await pool.request()
      .input('username', mssql.NVarChar, username)
      .input('password', mssql.NVarChar, password)
      .query('SELECT * FROM Administrators WHERE username = @username AND password = @password');

    if (result.recordset.length > 0) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error('Error during login validation:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


app.post('/adminLogout', (req, res) => {
  console.log('Administrator logged out');
  res.json({ success: true });
});

// 需要登入的 API
app.get('/secureEndpoint', (req, res) => {
  // 檢查使用者是否已通過身份驗證
  const isAuthenticated = req.session.username; 

  if (isAuthenticated) {
    res.json({ success: true, message: 'Secure data' });
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
});

// 解析 JSON 請求
app.use(express.json());



// API endpoint 獲取客戶信息
app.get('/api/getAllGuests', async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query('SELECT * FROM Guests');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error during fetching all guests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});

// API endpoint 搜尋客戶資料
app.post('/api/searchGuests', async (req, res) => {
  const { ID,name, phone, email } = req.body;

  try {
    const pool = await mssql.connect(config);

    let queryString = 'SELECT * FROM Guests WHERE 1 = 1';

    // 動態的 SQL 查詢語句
    if (ID) {
      queryString += ` AND guest_id LIKE '%${ID}%'`;
    }
    if (name) {
      queryString += ` AND name LIKE '%${name}%'`;
    }
    if (phone) {
      queryString += ` AND contact_phone LIKE '%${phone}%'`;
    }
    if (email) {
      queryString += ` AND email LIKE '%${email}%'`;
    }

    const result = await pool.request().query(queryString);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error during searching guests:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


app.delete('/api/deleteGuest/:guestId', async (req, res) => {
  const guestId = req.params.guestId;

  try {
    const pool = await mssql.connect(config);

    const transaction = await new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 刪除相關的預訂
      await transaction.request()
        .input('guestId', mssql.Int, guestId)
        .query('DELETE FROM Reservations WHERE guest_id = @guestId');

      // 刪除客戶
      const result = await transaction.request()
        .input('guestId', mssql.Int, guestId)
        .query('DELETE FROM Guests WHERE guest_id = @guestId');

      await transaction.commit();

      // 檢查影響（成功刪除）
      if (result.rowsAffected > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: 'Guest not found or could not be deleted.' });
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error during deleting guest:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


app.put('/api/updateGuest/:guestId', async (req, res) => {
  const guestId = req.params.guestId;
  const { name, contactPhone, email } = req.body;

  try {
    const pool = await mssql.connect(config);
    const transaction = await pool.transaction();

    try {
      await transaction.begin();

      console.log('ContactPhone:', contactPhone);

      const result = await transaction.request()
        .input('guestId', mssql.Int, guestId)
        .input('name', mssql.NVarChar, name)
        .input('contactPhone', mssql.NVarChar, contactPhone) 
        .input('email', mssql.NVarChar, email)
        .query('UPDATE Guests SET name = @name, contact_phone = @contactPhone, email = @email WHERE guest_id = @guestId');


      await transaction.commit();

      if (result.rowsAffected > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: 'Guest not found or could not be updated.' });
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error during updating guest:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});



// API endpoint 獲取訂單資訊
app.get('/api/getAllReservations', async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query('SELECT * FROM Reservations');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error during fetching all reservations:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});

// API endpoint 搜尋訂單資訊
app.post('/api/searchReservations', async (req, res) => {
  const {ID, checkInDate, checkOutDate, roomNumber, paymentStatus } = req.body;

  try {
    const pool = await mssql.connect(config);

    let queryString = 'SELECT * FROM Reservations WHERE 1 = 1';

    if (ID) {
      queryString += ` AND guest_id LIKE '%${ID}%'`;
    }
    if (checkInDate) {
      queryString += ` AND check_in_date = '${checkInDate}'`;
    }
    if (checkOutDate) {
      queryString += ` AND check_out_date = '${checkOutDate}'`;
    }
    if (roomNumber) {
      queryString += ` AND room_number = ${roomNumber}`;
    }
    if (paymentStatus) {
      queryString += ` AND payment_status LIKE '%${paymentStatus}%'`;
    }

    const result = await pool.request().query(queryString);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error during searching reservations:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});

// API endpoint 刪除訂單
app.delete('/api/deleteReservation/:reservationId', async (req, res) => {
  const reservationId = req.params.reservationId;

  try {
    const pool = await mssql.connect(config);

    const transaction = await new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 刪除訂單
      const result = await transaction.request()
        .input('reservationId', mssql.Int, reservationId)
        .query('DELETE FROM Reservations WHERE reservation_id = @reservationId');

      await transaction.commit();

      // 檢查影響（成功刪除）
      if (result.rowsAffected > 0) {
        // 刷新顯示訂單資訊的表格
        res.json({ success: true });
      } else {
        res.json({ success: false, error: 'Reservation not found or could not be deleted.' });
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error during deleting reservation:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


app.put('/api/updateReservation/:reservationId', async (req, res) => {
  const reservationId = req.params.reservationId;
  const { checkInDate, checkOutDate, roomNumber, paymentStatus } = req.body;

  try {
    const pool = await mssql.connect(config);
    const transaction = await pool.transaction();

    try {
      await transaction.begin();

      const daysDifference = Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24));
      let totalPrice;
      if (roomNumber === '303' || roomNumber === '305') {
        totalPrice = daysDifference * 10000;
      } else {
        totalPrice = daysDifference * 9000;
      }

      const result = await transaction.request()
        .input('reservationId', mssql.Int, reservationId)
        .input('checkInDate', mssql.Date, checkInDate || null)
        .input('checkOutDate', mssql.Date, checkOutDate || null)
        .input('roomNumber', mssql.NVarChar, roomNumber)
        .input('totalPrice', mssql.Decimal(10, 2), totalPrice)
        .input('paymentStatus', mssql.NVarChar, paymentStatus)
        .query('UPDATE Reservations SET check_in_date = @checkInDate, check_out_date = @checkOutDate, room_number = @roomNumber, total_price = @totalPrice, payment_status = @paymentStatus WHERE reservation_id = @reservationId');

      await transaction.commit();

      if (result.rowsAffected > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: 'Reservation not found or could not be updated.' });
      }
    } catch (error) {
      await transaction.rollback();
      console.error('Error during transaction:', error);
      console.log('Request body:', req.body);
      throw error;
    }
  } catch (error) {
    console.error('Error during updating reservation:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


// API endpoint 獲取聯絡人
app.get('/api/getAllContacts', async (req, res) => {
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query('SELECT * FROM Contact');
    res.json(result.recordset);
  } catch (error) {
    console.error('Error during fetching all contacts:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});

// API endpoint 搜尋聯絡人資料
app.post('/api/searchContacts', async (req, res) => {
  const { name, email } = req.body;

  try {
    const pool = await mssql.connect(config);

    let queryString = 'SELECT * FROM Contact WHERE 1 = 1';

    if (name) {
      queryString += ` AND name LIKE '%${name}%'`;
    }
    if (email) {
      queryString += ` AND email LIKE '%${email}%'`;
    }

    const result = await pool.request().query(queryString);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error during searching contacts:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }

});

// API endpoint 刪除聯絡人
app.delete('/api/deleteContact/:contactId', async (req, res) => {
  const contactId = req.params.contactId;

  try {
    const pool = await mssql.connect(config);

    const transaction = await new mssql.Transaction(pool);
    await transaction.begin();

    try {
      // 刪除聯絡人
      const result = await transaction.request()
        .input('contactId', mssql.Int, contactId)
        .query('DELETE FROM Contact WHERE contact_id = @contactId');

      await transaction.commit();

      if (result.rowsAffected > 0) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: 'Contact not found or could not be deleted.' });
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error during deleting contact:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    mssql.close();
  }
});


// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
