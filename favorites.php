<?php
require 'config.php';
session_start();

$userId = $_SESSION['user_id'] ?? 0;
if (!$userId) {
  header("Location: login.php");
  exit;
}

$stmt = $pdo->prepare("SELECT cars.* FROM favorites JOIN cars ON favorites.car_id = cars.id WHERE favorites.user_id = ?");
$stmt->execute([$userId]);
$cars = $stmt->fetchAll();
?>

<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Обране</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
<?php include 'header.php'; ?>

<div class="container py-5">
  <h1>❤️ Мої обрані авто</h1>
  <?php if (count($cars) === 0): ?>
    <p class="text-muted">Немає обраних авто.</p>
  <?php else: ?>
    <div class="row">
      <?php foreach ($cars as $car): ?>
        <div class="col-md-4 mb-4">
          <div class="card">
            <img src="uploads/<?php echo htmlspecialchars($car['main_image']); ?>" class="card-img-top">
            <div class="card-body">
              <h5 class="card-title"><?php echo htmlspecialchars($car['name']); ?></h5>
              <a href="lot.php?id=<?php echo $car['id']; ?>" class="btn btn-warning">➡️ Переглянути</a>
            </div>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>

</body>
</html>
