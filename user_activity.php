<?php
require 'config.php';
session_start();

$userId = $_SESSION['user_id'] ?? 0;
if (!$userId) {
  header("Location: login.php");
  exit;
}
$email = $_SESSION['user_email'] ?? 'guest@example.com';

$favStmt = $pdo->prepare("SELECT cars.* FROM favorites JOIN cars ON favorites.car_id = cars.id WHERE favorites.user_id = ?");
$favStmt->execute([$userId]);
$favorites = $favStmt->fetchAll();

$bidStmt = $pdo->prepare("SELECT DISTINCT cars.* FROM bids JOIN cars ON bids.car_id = cars.id WHERE bids.user_id = ?");
bidStmt->execute([$userId]);
$bidCars = $bidStmt->fetchAll();

$myCarsStmt = $pdo->prepare("SELECT * FROM cars WHERE seller_id = ?");
$myCarsStmt->execute([$userId]);
$myCars = $myCarsStmt->fetchAll();

$activityStmt = $pdo->prepare("SELECT * FROM user_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 100");
$activityStmt->execute([$userId]);
$activities = $activityStmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Кабінет користувача</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color: #f5f5f7; color: #000; }
    .sidebar { min-height: 100vh; background: #e5e5ea; border-right: 1px solid #ccc; }
    .profile-img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; }
    .nav-link { color: #000; transition: 0.3s; }
    .nav-link:hover { background-color: #d1d1d6; border-radius: 0.5rem; }
    .nav-link.active { font-weight: bold; background: #d1d1d6; border-radius: 0.5rem; }
    .card { border-radius: 1rem; background-color: #fff; }
    .btn-primary { background-color: #007aff; border: none; }
    .btn-outline-primary { border-color: #007aff; color: #007aff; }
    .btn-outline-primary:hover { background-color: #007aff; color: white; }
    .text-green { color: green; }
  </style>
  <script>
    function showTab(tabId) {
      document.querySelectorAll('.content-tab').forEach(t => t.style.display = 'none');
      document.getElementById(tabId).style.display = 'block';
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + tabId).classList.add('active');
    }
    window.onload = () => showTab('favorites');
  </script>
</head>
<body>
<?php include 'header.php'; ?>
<div class="container-fluid">
  <div class="row">
    <div class="col-md-3 p-3 sidebar">
      <div class="text-center">
        <img src="img/profile-placeholder.png" class="profile-img" alt="Аватар">
        <div class="fw-bold"><?php echo htmlspecialchars($email); ?></div>
      </div>
      <hr>
      <nav class="nav flex-column">
        <a class="nav-link" id="nav-favorites" href="#" onclick="showTab('favorites')">⭐ Обрані авто</a>
        <a class="nav-link" id="nav-bids" href="#" onclick="showTab('bids')">💶 Ставки</a>
        <a class="nav-link" id="nav-my" href="#" onclick="showTab('my')">🚗 Мої авто</a>
        <a class="nav-link" id="nav-activity" href="#" onclick="showTab('activity')">📆 Історія дій</a>
        <a class="nav-link" id="nav-settings" href="#" onclick="showTab('settings')">⚙️ Налаштування</a>
      </nav>
    </div>
    <div class="col-md-9 p-4">
      <div id="favorites" class="content-tab">
        <h3>⭐ Обрані авто</h3>
        <?php if (count($favorites) === 0): ?>
          <p class="text-muted">У вас немає обраних авто.</p>
        <?php else: ?>
          <div class="row row-cols-1 row-cols-md-2 g-4">
            <?php foreach ($favorites as $car): ?>
              <div class="col">
                <div class="card h-100 shadow-sm">
                  <img src="uploads/<?php echo htmlspecialchars($car['main_image']); ?>" class="card-img-top" style="max-height:180px; object-fit:cover;">
                  <div class="card-body">
                    <h5 class="card-title"><?php echo htmlspecialchars($car['name']); ?></h5>
                    <p class="card-text">Рік: <?php echo $car['year']; ?> | Пробіг: <?php echo $car['mileage_km']; ?> км</p>
                    <a href="lot.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-primary">🔍 Переглянути</a>
                  </div>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>

      <div id="bids" class="content-tab" style="display:none;">
        <h3>💶 Ставки</h3>
        <?php if (count($bidCars) === 0): ?>
          <p class="text-muted">Ви ще не поставили ставок.</p>
        <?php else: ?>
          <div class="row row-cols-1 row-cols-md-2 g-4">
            <?php foreach ($bidCars as $car): ?>
              <div class="col">
                <div class="card h-100 shadow-sm">
                  <img src="uploads/<?php echo htmlspecialchars($car['main_image']); ?>" class="card-img-top" style="max-height:180px; object-fit:cover;">
                  <div class="card-body">
                    <h5 class="card-title"><?php echo htmlspecialchars($car['name']); ?></h5>
                    <p class="card-text">Рік: <?php echo $car['year']; ?> | Пробіг: <?php echo $car['mileage_km']; ?> км</p>
                    <p class="mb-2">Ціна зараз: <span class="fw-semibold <?php echo ($car['winner_id'] ?? 0) == $userId ? 'text-green' : ''; ?>"><?php echo $car['current_price'] ?? '—'; ?> $</span></p>
                    <a href="lot.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-primary">🔍 Переглянути</a>
                  </div>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>

      <div id="my" class="content-tab" style="display:none;">
        <h3>🚗 Мої авто</h3>
        <a href="seller_dashboard.php" class="btn btn-success btn-sm mb-3">➕ Додати нове авто</a>
        <?php if (count($myCars) === 0): ?>
          <p class="text-muted">Ви ще не додали авто.</p>
        <?php else: ?>
          <div class="row row-cols-1 row-cols-md-2 g-4">
            <?php foreach ($myCars as $car): ?>
              <div class="col">
                <div class="card h-100 shadow-sm">
                  <img src="uploads/<?php echo htmlspecialchars($car['main_image']); ?>" class="card-img-top" style="max-height:180px; object-fit:cover;">
                  <div class="card-body">
                    <h5 class="card-title"><?php echo htmlspecialchars($car['name']); ?></h5>
                    <p class="card-text">Рік: <?php echo $car['year']; ?> | Пробіг: <?php echo $car['mileage_km']; ?> км</p>
                    <a href="edit_my_car.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-outline-primary">✏️ Редагувати</a>
                    <a href="lot.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-primary">🔍 Переглянути</a>
                  </div>
                </div>
              </div>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
      </div>

      <div id="activity" class="content-tab" style="display:none;">
        <h3>📆 Історія дій</h3>
        <?php if (count($activities) === 0): ?>
          <p class="text-muted">Поки що немає активності.</p>
        <?php else: ?>
          <ul class="list-group">
            <?php foreach ($activities as $act): ?>
              <li class="list-group-item">
                <strong><?php echo date("d.m.Y H:i", strtotime($act['created_at'])); ?>:</strong>
                <?php echo htmlspecialchars($act['action']); ?> — <em><?php echo htmlspecialchars($act['details']); ?></em>
              </li>
            <?php endforeach; ?>
          </ul>
        <?php endif; ?>
      </div>

      <div id="settings" class="content-tab" style="display:none;">
        <h3>⚙️ Налаштування</h3>
        <p>Функціонал налаштувань буде доступний пізніше.</p>
      </div>
    </div>
  </div>
</div>
</body>
</html>
