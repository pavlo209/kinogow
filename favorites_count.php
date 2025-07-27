<?php
require 'config.php';
session_start();
header('Content-Type: application/json');

$userId = $_SESSION['user_id'] ?? 0;

if ($userId) {
  $stmt = $pdo->prepare("SELECT COUNT(*) FROM favorites WHERE user_id = ?");
  $stmt->execute([$userId]);
  $count = $stmt->fetchColumn();
} else {
  $count = 0;
}

echo json_encode(['count' => $count]);
