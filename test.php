<?php
$host = 'localhost';
$dbname = 'u349284287_au'; // АБО u349284287_umix, якщо ви це не змінювали
$user = 'u349284287_au';
$pass = 'Ab=7xk&Innwv';

try {
    $pdo = new PDO(\"mysql:host=$host;dbname=$dbname;charset=utf8\", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die(\"Помилка підключення до БД: \" . $e->getMessage());
}
?>
