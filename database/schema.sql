-- Shining Hotel 資料庫結構(Microsoft SQL Server)

CREATE DATABASE hotel;
GO
USE hotel;
GO

-- 房型與房價
CREATE TABLE Rooms (
    room_number INT            NOT NULL PRIMARY KEY,
    room_price  DECIMAL(10, 2) NOT NULL
);

-- 顧客資料
CREATE TABLE Guests (
    guest_id      INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    name          NVARCHAR(255)      NOT NULL,
    contact_phone NVARCHAR(20)       NOT NULL,
    email         NVARCHAR(255)      NOT NULL
);

-- 訂單
CREATE TABLE Reservations (
    reservation_id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    check_in_date  DATE               NOT NULL,
    check_out_date DATE               NOT NULL,
    guests_count   INT                NOT NULL,
    room_number    INT                NOT NULL REFERENCES Rooms(room_number),
    guest_id       INT                NULL     REFERENCES Guests(guest_id),
    total_price    DECIMAL(10, 2)     NOT NULL,
    bank           NVARCHAR(50)       NOT NULL,  -- 銀行代碼
    account_number NVARCHAR(5)        NOT NULL,  -- 轉帳帳戶後五碼
    payment_status NVARCHAR(10)       NOT NULL DEFAULT 'undone'
);

-- 顧客聯絡與意見回饋
CREATE TABLE Contact (
    contact_id      INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    name            NVARCHAR(255)      NOT NULL,
    email           NVARCHAR(255)      NOT NULL,
    message         TEXT               NOT NULL,
    submission_time DATETIME           NULL DEFAULT GETDATE()
);

-- 後台管理員
CREATE TABLE Administrators (
    admin_id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    username NVARCHAR(50)       NOT NULL,
    password NVARCHAR(255)      NOT NULL
);
GO

-- 初始資料
INSERT INTO Rooms (room_number, room_price) VALUES
    (301, 9000), (302, 9000), (303, 10000), (304, 9000), (305, 10000);

-- 範例管理員帳號(請自行修改)
INSERT INTO Administrators (username, password) VALUES ('admin', 'change_me');
GO
