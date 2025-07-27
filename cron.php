$now = time();
$stmt = $pdo->query("SELECT * FROM cars WHERE end_time IS NOT NULL AND is_active = 1");

while ($car = $stmt->fetch()) {
  $end = strtotime($car['end_time']);
  if ($end - $now <= 600 && $end - $now > 540) { // 10 хвилин ± 1 хв на точність
    $lastBidders = $pdo->prepare("SELECT DISTINCT user_id FROM bids WHERE car_id = ?");
    $lastBidders->execute([$car['id']]);

    while ($bidder = $lastBidders->fetchColumn()) {
      $pdo->prepare("INSERT INTO notifications (user_id, car_id, message) VALUES (?, ?, ?)")
          ->execute([$bidder, $car['id'], "До завершення аукціону на '{$car['name']}' залишилось менше 10 хв!"]);
    }
  }
}
