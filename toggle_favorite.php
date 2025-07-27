<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

$userId = $_SESSION['user_id'] ?? 0;
if (!$userId) {
  echo json_encode(['success' => false, 'error' => 'Unauthorized']);
  exit;
}

$carId = (int)($_POST['car_id'] ?? 0);
if (!$carId) {
  echo json_encode(['success' => false, 'error' => 'No Car ID']);
  exit;
}

// Перевіряємо
$stmt = $pdo->prepare("SELECT * FROM favorites WHERE user_id = ? AND car_id = ?");
$stmt->execute([$userId, $carId]);

if ($stmt->fetch()) {
  $del = $pdo->prepare("DELETE FROM favorites WHERE user_id = ? AND car_id = ?");
  $del->execute([$userId, $carId]);
  echo json_encode(['success' => true, 'fav' => false]);
} else {
  $add = $pdo->prepare("INSERT INTO favorites (user_id, car_id) VALUES (?, ?)");
  $add->execute([$userId, $carId]);
  echo json_encode(['success' => true, 'fav' => true]);
}
