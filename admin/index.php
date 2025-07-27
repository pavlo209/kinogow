
<?php
require '../config.php';
session_start();

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: ../login.php");
  exit;
}

$totalUsers = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
$totalLots = $pdo->query("SELECT COUNT(*) FROM cars")->fetchColumn();
$activeLots = $pdo->query("SELECT COUNT(*) FROM cars WHERE is_approved = 1 AND end_time > NOW()")->fetchColumn();
$endedLots = $pdo->query("SELECT COUNT(*) FROM cars WHERE is_approved = 1 AND end_time <= NOW()")->fetchColumn();
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Адмін-панель</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
    <?php include 'header_admin.php'; ?>

<div class="container py-5">
  <h2 class="mb-4">📊 Адмін-панель</h2>
  <div class="row g-4 mb-5">
    <div class="col-md-3">
      <div class="card shadow text-center p-3">
        <h5>👥 Користувачів</h5>
        <div class="display-6"><?php echo $totalUsers; ?></div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card shadow text-center p-3">
        <h5>🚗 Усього лотів</h5>
        <div class="display-6"><?php echo $totalLots; ?></div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card shadow text-center p-3">
        <h5>🟢 Активні</h5>
        <div class="display-6"><?php echo $activeLots; ?></div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card shadow text-center p-3">
        <h5>⏱ Завершені</h5>
        <div class="display-6"><?php echo $endedLots; ?></div>
      </div>
    </div>
  </div>

  <div class="d-flex gap-3">
    <a href="add_car.php" class="btn btn-success">➕ Додати авто</a>
    <a href="lots.php" class="btn btn-primary">📋 Усі лоти</a>
    <a href="users.php" class="btn btn-secondary">👤 Користувачі</a>
  </div>
</div>
</body>
</html>
