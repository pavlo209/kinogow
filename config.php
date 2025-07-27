<?php
$host = 'localhost';
$dbname = 'u349284287_au';
$user = 'u349284287_au';
$pass = '~xOn;oB+Z5C';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Помилка підключення до БД: " . $e->getMessage());
}
?>
