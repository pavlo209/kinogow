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

$bidStmt = $pdo->prepare("SELECT b.*, c.name, c.main_image, c.year, c.mileage_km, c.id AS car_id, c.winner_id FROM bids b JOIN cars c ON b.car_id = c.id WHERE b.user_id = ? ORDER BY b.created_at DESC");
$bidStmt->execute([$userId]);
$bidHistory = $bidStmt->fetchAll();

$myCarsStmt = $pdo->prepare("SELECT * FROM cars WHERE seller_id = ?");
$myCarsStmt->execute([$userId]);
$myCars = $myCarsStmt->fetchAll();

$wonStmt = $pdo->prepare("SELECT COUNT(*) FROM cars WHERE winner_id = ? AND end_time < NOW()");
$wonStmt->execute([$userId]);
$wonCount = $wonStmt->fetchColumn();

$favCount = count($favorites);
$bidCount = count($bidHistory);
$myCount = count($myCars);
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Кабінет користувача</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color: #f5f5f7; color: #000; }
    .sidebar { min-height: 100vh; background: #e5e5ea; border-right: 1px solid #ccc; }
    .profile-img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; }
    .nav-link { color: #000; transition: 0.3s; }
    .nav-link:hover, .nav-link.active { background-color: #d1d1d6; border-radius: 0.5rem; font-weight: bold; }
    .card { border-radius: 1rem; background-color: #fff; }
    .btn-primary { background-color: #007aff; border: none; }
    .btn-outline-primary { border-color: #007aff; color: #007aff; }
    .btn-outline-primary:hover { background-color: #007aff; color: white; }
    .text-green { color: green; }
    .content-tab { display: none; }
    @media (max-width: 768px) {
      .sidebar { min-height: auto; border: none; margin-bottom: 20px; }
      .nav-link { padding: 10px 15px; }
    }
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
        <a class="nav-link" id="nav-history" href="#" onclick="showTab('history')">📆 Історія</a>
        <a class="nav-link" id="nav-settings" href="#" onclick="showTab('settings')">⚙️ Налаштування</a>
      </nav>
    </div>
    <div class="col-md-9 p-4">
      <div class="row text-center mb-4">
        <div class="col-6 col-md-3">
          <div class="card shadow-sm">
            <div class="card-body">
              <h6 class="text-muted">⭐ Обране</h6>
              <h4><?php echo $favCount; ?></h4>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card shadow-sm">
            <div class="card-body">
              <h6 class="text-muted">💶 Ставки</h6>
              <h4><?php echo $bidCount; ?></h4>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3 mt-3 mt-md-0">
          <div class="card shadow-sm">
            <div class="card-body">
              <h6 class="text-muted">🏁 Виграно</h6>
              <h4><?php echo $wonCount; ?></h4>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3 mt-3 mt-md-0">
          <div class="card shadow-sm">
            <div class="card-body">
              <h6 class="text-muted">🚗 Мої авто</h6>
              <h4><?php echo $myCount; ?></h4>
            </div>
          </div>
        </div>
      </div>

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

      <div id="bids" class="content-tab">
        <h3>💶 Ставки</h3>
        <?php if (count($bidHistory) === 0): ?>
          <p class="text-muted">Ви ще не поставили ставок.</p>
        <?php else: ?>
          <table class="table table-bordered">
            <thead><tr><th>Авто</th><th>Сума</th><th>Дата</th><th>Статус</th></tr></thead>
            <tbody>
              <?php foreach ($bidHistory as $bid): ?>
                <tr>
                  <td><a href="lot.php?id=<?php echo $bid['car_id']; ?>"><?php echo htmlspecialchars($bid['name']); ?></a></td>
                  <td><?php echo $bid['bid_amount']; ?> $</td>
                  <td><?php echo date('d.m.Y H:i', strtotime($bid['created_at'])); ?></td>
                  <td>
                    <?php echo ($bid['winner_id'] == $userId) ? '<span class="text-green">Перемога</span>' : 'Перебито'; ?>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        <?php endif; ?>
      </div>

      <div id="my" class="content-tab">
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

      <div id="history" class="content-tab">
        <h3>📆 Історія активності</h3>
        <p class="text-muted">У цьому розділі буде доступна історія дій — редагування авто, участь у торгах, перемоги.</p>
      </div>

      <div id="settings" class="content-tab">
        <h3>⚙️ Налаштування</h3>
        <p>Функціонал налаштувань буде доступний пізніше.</p>
      </div>
    </div>
  </div>
</div>
</body>
</html>
