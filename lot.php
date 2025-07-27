<?php
require 'config.php';
session_start();

$carId = $_GET['id'] ?? 0;
$userId = $_SESSION['user_id'] ?? 0;

$stmt = $pdo->prepare("SELECT * FROM cars WHERE id = ?");
$stmt->execute([$carId]);
$car = $stmt->fetch();
$endTime = strtotime($car['end_time'] ?? '');
$currentTime = time();

if (!$car) {
  echo "<p>Авто не знайдено або неактивне.</p>";
  exit;
}

// Улюблене
$isFavorite = false;
if ($userId) {
  if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['toggle_favorite'])) {
    $carId = (int)$carId;
    $exists = $pdo->prepare("SELECT * FROM favorites WHERE user_id = ? AND car_id = ?");
    $exists->execute([$userId, $carId]);
    if ($exists->fetch()) {
      $del = $pdo->prepare("DELETE FROM favorites WHERE user_id = ? AND car_id = ?");
      $del->execute([$userId, $carId]);
    } else {
      $add = $pdo->prepare("INSERT INTO favorites (user_id, car_id) VALUES (?, ?)");
      $add->execute([$userId, $carId]);
    }
    header("Location: lot.php?id=" . $carId);
    exit;
  }

  $check = $pdo->prepare("SELECT * FROM favorites WHERE user_id = ? AND car_id = ?");
  $check->execute([$userId, $carId]);
  $isFavorite = $check->fetch() ? true : false;
}

// Галерея
$gallery = json_decode($car['additional_images'] ?? '[]', true);
$mainImage = htmlspecialchars($car['main_image']);

// Поточна ставка
$bidStmt = $pdo->prepare("SELECT * FROM bids WHERE car_id = ? ORDER BY bid_amount DESC LIMIT 1");
$bidStmt->execute([$carId]);
$currentBid = $bidStmt->fetch();

// Ставка користувача
$userBid = null;
if ($userId) {
  $ub = $pdo->prepare("SELECT * FROM bids WHERE car_id = ? AND user_id = ? ORDER BY bid_amount DESC LIMIT 1");
  $ub->execute([$carId, $userId]);
  $userBid = $ub->fetch();
}

// Автоставки
$allAutoBids = $pdo->prepare("SELECT * FROM auto_bids WHERE car_id = ? ORDER BY max_bid DESC");
$allAutoBids->execute([$carId]);
$autoBids = $allAutoBids->fetchAll();

if (!empty($autoBids)) {
  $highest = $autoBids[0];
  if (!$currentBid || $highest['max_bid'] > $currentBid['bid_amount']) {
    if ($highest['user_id'] != ($currentBid['user_id'] ?? 0)) {
      $newAutoBid = min($highest['max_bid'], ($currentBid['bid_amount'] ?? 0) + 100);
      $stmt = $pdo->prepare("INSERT INTO bids (car_id, user_id, bid_amount) VALUES (?, ?, ?)");
      $stmt->execute([$carId, $highest['user_id'], $newAutoBid]);

      // Сповіщення: перебили ставку
      if ($currentBid && $currentBid['user_id'] != $highest['user_id']) {
        $pdo->prepare("INSERT INTO notifications (user_id, car_id, message) VALUES (?, ?, ?)")
            ->execute([$currentBid['user_id'], $carId, "🚨 Вашу ставку перебито!"]);
      }

      header("Location: lot.php?id=" . $carId);
      exit;
    }
  }
}

// Звичайна ставка
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['max_bid']) && $userId) {
  $maxBid = (int)$_POST['max_bid'];

  $exists = $pdo->prepare("SELECT * FROM auto_bids WHERE user_id = ? AND car_id = ?");
  $exists->execute([$userId, $carId]);

  if ($exists->fetch()) {
    $update = $pdo->prepare("UPDATE auto_bids SET max_bid = ? WHERE user_id = ? AND car_id = ?");
    $update->execute([$maxBid, $userId, $carId]);
  } else {
    $insert = $pdo->prepare("INSERT INTO auto_bids (user_id, car_id, max_bid) VALUES (?, ?, ?)");
    $insert->execute([$userId, $carId, $maxBid]);
  }

  header("Location: lot.php?id=" . $carId);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['max_bid']) && $userId) {
  $newBid = ($currentBid['bid_amount'] ?? 0) + 100;
  $stmt = $pdo->prepare("INSERT INTO bids (car_id, user_id, bid_amount) VALUES (?, ?, ?)");
  $stmt->execute([$carId, $userId, $newBid]);
  header("Location: lot.php?id=" . $carId);
  exit;
}
?>

<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title><?php echo htmlspecialchars($car['name']); ?></title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <!-- Стилі підключаються у header.php -->
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
<style>
    body {
      background-color: #f2f2f7;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    h1 {
      font-weight: 700;
    }
    .main-img {
      width: 100%;
      border-radius: 12px;
      object-fit: cover;
      max-height: 400px;
    }
    .thumbs {
      overflow-x: auto;
    }
    .thumbs img {
      width: 75px;
      height: 50px;
      object-fit: cover;
      margin-right: 6px;
      cursor: pointer;
      border-radius: 8px;
      border: 2px solid transparent;
    }
    .thumbs img:hover {
      border-color: #007aff;
    }
    .lot-price {
      font-size: 1.5rem;
      font-weight: bold;
      color: #000;
    }
    .lot-price.user-bid {
      color: #28a745;
    }
    .status {
      font-weight: bold;
      margin: 10px 0;
    }
    .status.win {
      color: #28a745;
    }
    .status.lose {
      color: #ff3b30;
    }
    .param-table td {
      padding: 6px 10px;
      font-size: 15px;
      background-color: #e5e5ea;
    }
    .notes textarea {
      width: 100%;
      height: 90px;
      margin-top: 10px;
      border-radius: 10px;
      border: 1px solid #ccc;
      padding: 10px;
    }
    .btn-accent {
      background-color: #f46036;
      color: #fff;
      font-weight: 500;
      border: none;
    }
    .btn-outline-primary {
      border-radius: 12px;
    }
    .alert-info {
      background-color: #d1d1d6;
      color: #000;
      border: none;
      border-radius: 12px;
    }
    .alert-danger {
      border-radius: 12px;
    }

    .max-bid-input {
      max-width: 200px;
    }

    @media (max-width: 768px) {
      h1 {
        font-size: 1.5rem;
      }
      .main-img {
        max-height: 250px;
      }
      .thumbs img {
        width: 60px;
        height: 40px;
        margin-bottom: 6px;
      }
    }

    @media (max-width: 576px) {
      .lot-price {
        font-size: 1.25rem;
      }
      .max-bid-input {
        max-width: 100%;
      }
      .table-responsive {
        font-size: 0.875rem;
      }
    }
  </style>
  <script>
    function switchImage(src) {
      document.getElementById('mainImage').src = src;
    }
  </script>
</head>
<body>
<?php include 'header.php'; ?>
<div class="container py-4">
  <h1 class="mb-4 text-center text-md-start"><?php echo htmlspecialchars($car['name']); ?></h1>
  <div class="row g-4">

    <div class="col-12 col-md-6">
      <img id="mainImage" src="uploads/<?php echo $mainImage; ?>" class="main-img mb-2 img-fluid" alt="<?php echo htmlspecialchars($car['name']); ?>">
      <div class="thumbs d-flex flex-wrap">
        <?php foreach ($gallery as $img): ?>
          <img src="uploads/<?php echo htmlspecialchars($img); ?>" onclick="switchImage(this.src)" alt="thumbnail">
        <?php endforeach; ?>
      </div>
      <div class="notes mt-3">
        <label class="form-label">Мої замітки:</label>
        <textarea class="form-control" placeholder="Введіть нотатку..."></textarea>
      </div>
    </div>
    <div class="col-12 col-md-6">
       <?php if ($userId): ?>

<?php endif; ?>

     <?php if ($endTime > $currentTime): ?>
  <div class="alert alert-info">
    До завершення аукціону: <span id="countdown"></span>
  </div>
<?php else: ?>
  <div class="alert alert-danger fw-bold">⏰ Аукціон завершено</div>
<?php endif; ?>
 <form method="post" class="mb-2">
    <button name="toggle_favorite"
            class="btn btn-sm <?php echo $isFavorite ? 'btn-danger' : 'btn-outline-danger'; ?> float-end">
      <?php echo $isFavorite ? '✅ В обраному ' : '❤️ Додати в обране'; ?>
    </button>
  </form>
      <div class="lot-price">Актуальна ціна: €<?php echo number_format($currentBid['bid_amount'] ?? 0, 0, '.', ' '); ?></div>
      <?php if ($userId): ?>
        <?php if ($userBid && $userBid['bid_amount'] >= ($currentBid['bid_amount'] ?? 0)): ?>
          <div class="status win">Ваша ставка найвища ✅</div>
        <?php elseif ($userBid): ?>
          <div class="status lose">Вашу ставку перебито ❌</div>
        <?php endif; ?>
        <form method="post" class="d-grid gap-2 mt-2">
          <button type="submit" class="btn btn-accent">Зробити ставку +100 €</button>
        </form>
        <form method="post" class="mt-3">
  <label for="max_bid" class="form-label">Максимальна ціна (€):</label>
  <input type="number" name="max_bid" class="form-control max-bid-input" required>
  <button type="submit" class="btn btn-outline-primary mt-2">Встановити автоставку</button>

</form>

      <?php else: ?>
        <p class="mt-2"><a href="login.php">Увійдіть</a>, щоб зробити ставку.</p>
      <?php endif; ?>

  <div class="table-responsive">
  <table class="table table-striped mt-5">
  <?php
    function safe($v) { return $v ? htmlspecialchars($v) : '—'; }
  ?>
  <tr><th>Рік випуску</th><td><?= safe($car['year']) ?></td></tr>
  <tr><th>Перша реєстрація</th><td><?= safe($car['registration_date']) ?></td></tr>
  <tr><th>Пробіг</th><td><?= $car['mileage_km'] ? $car['mileage_km'].' км' : '—' ?></td></tr>
  <tr><th>Тип палива</th><td><?= safe($car['fuel_type']) ?></td></tr>
  <tr><th>Потужність</th><td><?= ($car['power_kw'] || $car['power_hp']) ? "{$car['power_kw']} kW / {$car['power_hp']} HP" : '—' ?></td></tr>
  <tr><th>Обʼєм двигуна</th><td><?= $car['engine_cc'] ? "{$car['engine_cc']} см³" : '—' ?></td></tr>
  <tr><th>Коробка передач</th><td><?= safe($car['gearbox']) ?></td></tr>
  <tr><th>Тип кузова</th><td><?= safe($car['body_type']) ?></td></tr>
  <tr><th>Кількість попередніх власників</th><td><?= $car['owners'] ?? '—' ?></td></tr>
  <tr><th>Ключі</th><td><?= $car['keys'] ?? '—' ?></td></tr>
  <tr><th>Попередні пошкодження</th><td><?= safe($car['damage_reported']) ?></td></tr>
  <tr><th>Чи усунено пошкодження?</th><td><?= safe($car['damage_fixed']) ?></td></tr>
  <tr><th>Екологічний клас</th><td><?= safe($car['eco_class']) ?></td></tr>
  <tr><th>Сидіння</th><td><?= $car['seats'] ?? '—' ?></td></tr>
  <tr><th>Колір</th><td><?= safe($car['color']) ?></td></tr>
  <tr><th>VIN</th><td><?= safe($car['vin']) ?></td></tr>
</table>
  </div>

      <a href="car_condition.php?id=<?php echo $car['id']; ?>" class="btn btn-outline-primary mt-2">Перевірка авто</a>
    </div>

    <?php include 'lot/car_condition.php'; ?>
  </div>

</div><script>
<?php if ($endTime > $currentTime): ?>
  const countdown = document.getElementById("countdown");
  let timeLeft = <?php echo $endTime - $currentTime; ?>;

  function updateTimer() {
    if (timeLeft <= 0) {
      countdown.innerText = "Аукціон завершено";
      return;
    }
    const days = Math.floor(timeLeft / (60*60*24));
    const hours = Math.floor((timeLeft % (60*60*24)) / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;
    countdown.innerText = `${days}д ${hours}г ${minutes}хв ${seconds}с`;
    timeLeft--;
    setTimeout(updateTimer, 1000);
  }

  updateTimer();
<?php endif; ?>
</script>
<script>
  setInterval(() => {
    fetch('check_bid_status.php?car_id=<?php echo $carId; ?>')
      .then(res => res.json())
      .then(data => {
        if (data.outbid) {
          showToast("🚨 Вашу ставку перебито!");
          document.querySelector('.status').innerText = "Вашу ставку перебито ❌";
          document.querySelector('.status').classList.remove("win");
          document.querySelector('.status').classList.add("lose");
        }
      });
  }, 10000); // перевірка кожні 10 сек

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    document.getElementById('toast-container')?.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }
</script>

</body>
</html>