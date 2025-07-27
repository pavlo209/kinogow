<?php
require 'config.php';
session_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: login.php");
  exit;
}

$id = $_GET['id'] ?? 0;
$stmt = $pdo->prepare("SELECT * FROM cars WHERE id = ?");
$stmt->execute([$id]);
$car = $stmt->fetch();

if (!$car) {
  echo "<p>Авто не знайдено</p>";
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $fields = ['name', 'year', 'mileage_km', 'gearbox', 'engine_cc', 'fuel_type', 'vin', 'description', 'paint_report', 'damage_summary', 'paint_info', 'service_info', 'condition_description', 'start_time', 'end_time'];
  $values = [];
  foreach ($fields as $f) {
    $values[$f] = $_POST[$f] ?? null;
  }

  $damage_gallery = $_POST['damage_gallery_json'] ?? '[]';

  $stmt = $pdo->prepare("UPDATE cars SET
    name = ?, year = ?, mileage_km = ?, gearbox = ?, engine_cc = ?, fuel_type = ?, vin = ?,
    description = ?, paint_report = ?, damage_summary = ?, paint_info = ?, service_info = ?,
    condition_description = ?, start_time = ?, end_time = ?, damage_gallery = ?
    WHERE id = ?");

  $stmt->execute([...array_values($values), $damage_gallery, $id]);

  header("Location: lots.php");
  exit;
}

$gallery_json = $car['damage_gallery'] ?? '[]';
$gallery = is_string($gallery_json) ? json_decode($gallery_json, true) : [];
if (!is_array($gallery)) {
  $gallery = [];
}
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Редагування лота</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>
    .damage-thumb { max-width: 150px; border-radius: 4px; }
  </style>
</head>
<body>
<div class="container py-4">
  <h2>Редагування авто: <?php echo htmlspecialchars($car['name']); ?></h2>
  <form method="post">
    <div class="row">
      <div class="col-md-6">
        <label class="form-label">Назва авто</label>
        <input type="text" name="name" value="<?php echo htmlspecialchars($car['name']); ?>" class="form-control mb-2">

        <label class="form-label">Рік</label>
        <input type="number" name="year" value="<?php echo htmlspecialchars($car['year']); ?>" class="form-control mb-2">

        <label class="form-label">Пробіг (км)</label>
        <input type="number" name="mileage_km" value="<?php echo htmlspecialchars($car['mileage_km']); ?>" class="form-control mb-2">

        <label class="form-label">Коробка передач</label>
        <input type="text" name="gearbox" value="<?php echo htmlspecialchars($car['gearbox']); ?>" class="form-control mb-2">

        <label class="form-label">Обʼєм двигуна</label>
        <input type="number" name="engine_cc" value="<?php echo htmlspecialchars($car['engine_cc']); ?>" class="form-control mb-2">

        <label class="form-label">Тип пального</label>
        <input type="text" name="fuel_type" value="<?php echo htmlspecialchars($car['fuel_type']); ?>" class="form-control mb-2">

        <label class="form-label">VIN</label>
        <input type="text" name="vin" value="<?php echo htmlspecialchars($car['vin']); ?>" class="form-control mb-2">

        <label class="form-label">Опис</label>
        <textarea name="description" class="form-control mb-2"><?php echo htmlspecialchars($car['description']); ?></textarea>
      </div>

      <div class="col-md-6">
        <label class="form-label">Звіт по фарбі</label>
        <textarea name="paint_report" class="form-control mb-2"><?php echo htmlspecialchars($car['paint_report']); ?></textarea>

        <label class="form-label">Пошкодження (загальний опис)</label>
        <textarea name="damage_summary" class="form-control mb-2"><?php echo htmlspecialchars($car['damage_summary']); ?></textarea>

        <label class="form-label">Лакофарбове покриття</label>
        <textarea name="paint_info" class="form-control mb-2"><?php echo htmlspecialchars($car['paint_info']); ?></textarea>

        <label class="form-label">Сервісна історія</label>
        <textarea name="service_info" class="form-control mb-2"><?php echo htmlspecialchars($car['service_info']); ?></textarea>

        <label class="form-label">Опис пошкоджень</label>
        <textarea name="condition_description" class="form-control mb-2"><?php echo htmlspecialchars($car['condition_description']); ?></textarea>

        <label class="form-label">Дата старту аукціону</label>
        <input type="datetime-local" name="start_time" value="<?php echo htmlspecialchars($car['start_time']); ?>" class="form-control mb-2">

        <label class="form-label">Дата завершення аукціону</label>
        <input type="datetime-local" name="end_time" value="<?php echo htmlspecialchars($car['end_time']); ?>" class="form-control mb-2">
      </div>
    </div>

    <h5 class="mt-4">🖼️ Фото пошкоджень</h5>
    <div class="row g-2">
      <?php foreach ($gallery as $i => $item): ?>
        <div class="col-md-6">
          <img src="uploads/<?php echo htmlspecialchars($item['file']); ?>" class="damage-thumb mb-1">
          <input type="text" name="damage_desc[<?php echo $i; ?>]" value="<?php echo htmlspecialchars($item['note']); ?>" class="form-control mb-3" placeholder="Опис пошкодження">
        </div>
      <?php endforeach; ?>
    </div>

    <input type="hidden" name="damage_gallery_json" id="damage_gallery_json" value='<?php echo json_encode($gallery); ?>'>

    <button type="submit" class="btn btn-success mt-3">💾 Зберегти</button>
  </form>
</div>
</body>
</html>
