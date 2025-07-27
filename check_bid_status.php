<?php
require 'config.php';
session_start();

$carId = $_GET['car_id'] ?? 0;
$userId = $_SESSION['user_id'] ?? 0;

$outbid = false;

if ($userId && $carId) {
  $stmt = $pdo->prepare("SELECT * FROM bids WHERE car_id = ? ORDER BY bid_amount DESC LIMIT 1");
  $stmt->execute([$carId]);
  $topBid = $stmt->fetch();

  $userStmt = $pdo->prepare("SELECT * FROM bids WHERE car_id = ? AND user_id = ? ORDER BY bid_amount DESC LIMIT 1");
  $userStmt->execute([$carId, $userId]);
  $userBid = $userStmt->fetch();

  if ($userBid && $topBid && $userBid['bid_amount'] < $topBid['bid_amount']) {
    $outbid = true;
  }
}

echo json_encode(['outbid' => $outbid]);
