<?php
require 'config.php';
session_start();
$userId = $_SESSION['user_id'] ?? 0;

// Фільтри
$where = "WHERE is_approved = 1";
$params = [];

if (!empty($_GET['gearbox'])) {
  $where .= " AND gearbox = ?";
  $params[] = $_GET['gearbox'];
}
if (!empty($_GET['min_year'])) {
  $where .= " AND year >= ?";
  $params[] = (int)$_GET['min_year'];
}
if (!empty($_GET['max_year'])) {
  $where .= " AND year <= ?";
  $params[] = (int)$_GET['max_year'];
}

// Отримати лоти
$stmt = $pdo->prepare("SELECT * FROM cars $where ORDER BY id DESC");
$stmt->execute($params);
$cars = $stmt->fetchAll();

// Отримати обране
$favIds = [];
if ($userId) {
  $favStmt = $pdo->prepare("SELECT car_id FROM favorites WHERE user_id = ?");
  $favStmt->execute([$userId]);
  $favIds = $favStmt->fetchAll(PDO::FETCH_COLUMN);
}
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Лоти</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body>
<?php include 'header.php'; ?>

<div class="container my-4">
  <h1 class="mb-4">🚗 Актуальні лоти</h1>

  <form class="row g-3 mb-4" method="get">
    <div class="col-6 col-md-3">
      <input type="number" name="min_year" class="form-control" placeholder="Мін. рік" value="<?php echo $_GET['min_year'] ?? ''; ?>">
    </div>
    <div class="col-6 col-md-3">
      <input type="number" name="max_year" class="form-control" placeholder="Макс. рік" value="<?php echo $_GET['max_year'] ?? ''; ?>">
    </div>
    <div class="col-6 col-md-3">
      <select name="gearbox" class="form-select">
        <option value="">Всі КПП</option>
        <option value="автомат" <?php if (($_GET['gearbox'] ?? '') == 'автомат') echo 'selected'; ?>>Автомат</option>
        <option value="механіка" <?php if (($_GET['gearbox'] ?? '') == 'механіка') echo 'selected'; ?>>Механіка</option>
      </select>
    </div>
    <div class="col-6 col-md-3">
      <button class="btn btn-accent w-100">🔍 Фільтрувати</button>
    </div>
  </form>

  <?php if (count($cars) === 0): ?>
    <div class="alert alert-warning">Немає лотів за вибраними параметрами.</div>
  <?php endif; ?>

  <div class="row g-4">
    <?php foreach ($cars as $car): ?>
      <?php
        $mainImage = htmlspecialchars($car['main_image'] ?? 'placeholder.jpg');
        $bidStmt = $pdo->prepare("SELECT bid_amount FROM bids WHERE car_id = ? ORDER BY bid_amount DESC LIMIT 1");
        $bidStmt->execute([$car['id']]);
        $topBid = $bidStmt->fetchColumn() ?: 0;
        $endTime = strtotime($car['end_time'] ?? '+1 day');
        $favActive = in_array($car['id'], $favIds);
      ?>
      <div class="col-12 col-sm-6 col-lg-4">
        <div class="lot-card">
          <img src="uploads/<?php echo $mainImage; ?>" class="lot-img" alt="Фото авто">
          <div class="lot-content">
            <div class="d-flex justify-content-between">
              <div class="lot-title"><?php echo htmlspecialchars($car['name']); ?></div>
              <?php if ($userId): ?>
                <button type="button"
                  class="fav-btn <?php echo $favActive ? '' : 'outline'; ?>"
                  onclick="toggleFavorite(<?php echo $car['id']; ?>, this)">
                  <i class="fa<?php echo $favActive ? 's' : 'r'; ?> fa-heart"></i>
                </button>
              <?php endif; ?>
            </div>
            <div id="timer-<?php echo $car['id']; ?>" class="lot-timer"></div>
            <div class="lot-info">
              <div><i class="fa-solid fa-calendar"></i> <?php echo $car['year']; ?> | <i class="fa-solid fa-road"></i> <?php echo $car['mileage_km']; ?> км</div>
              <div><i class="fa-solid fa-cogs"></i> <?php echo htmlspecialchars($car['gearbox']); ?> | <i class="fa-solid fa-gas-pump"></i> <?php echo htmlspecialchars($car['fuel_type']); ?></div>
              <div><i class="fa-solid fa-key"></i> VIN: <?php echo htmlspecialchars($car['vin']); ?></div>
            </div>
            <div class="lot-price mt-2">💰 €<?php echo number_format($topBid, 0, '.', ' '); ?></div>
            <a href="lot.php?id=<?php echo $car['id']; ?>" class="btn btn-accent btn-sm mt-2 w-100">➡️ Переглянути</a>
          </div>
        </div>
      </div>

      <script>
        (function(){
          const endTime = <?php echo $endTime * 1000; ?>;
          const el = document.getElementById('timer-<?php echo $car['id']; ?>');
          function update() {
            const now = Date.now();
            let d = endTime - now;
            if (d <= 0) {
              el.innerText = "⏰ Завершено";
              clearInterval(int);
              return;
            }
            let days = Math.floor(d / (1000*60*60*24));
            let hrs = Math.floor((d % (1000*60*60*24)) / (1000*60*60));
            let mins = Math.floor((d % (1000*60*60)) / (1000*60));
            let secs = Math.floor((d % (1000*60)) / 1000);
            el.innerText = `⏰ ${days}д ${hrs}г ${mins}хв ${secs}с`;
          }
          update();
          let int = setInterval(update, 1000);
        })();
      </script>
    <?php endforeach; ?>
  </div>
</div>

<script>
function toggleFavorite(carId, btn) {
  fetch('toggle_favorite.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'car_id=' + carId
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const icon = btn.querySelector('i');
      if (data.fav) {
        btn.classList.remove('outline');
        icon.className = 'fas fa-heart';
      } else {
        btn.classList.add('outline');
        icon.className = 'far fa-heart';
      }
    }
  });
}
</script>

<?php include 'footer.php'; ?>
</body>
</html>


