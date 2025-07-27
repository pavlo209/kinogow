<?php
// === admin/add_car.php (оновлено з підтримкою фото) ===
require '../config.php';
session_start();
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: ../login.php");
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $fields = ['name', 'year', 'registration_date', 'mileage_km', 'fuel_type', 'engine_cc', 'power_kw', 'power_hp', 'gearbox', 'body_type', 'owners', 'keys', 'damage_reported', 'damage_fixed', 'eco_class', 'seats', 'color', 'vin', 'description', 'paint_info', 'service_info', 'condition_description', 'start_time', 'end_time'];
  $values = [];
  foreach ($fields as $f) {
    $values[$f] = $_POST[$f] ?? null;
  }

  // --- Головне фото ---
  $main_image = '';
  if (!empty($_FILES['main_image']['name'])) {
    $main_image = basename($_FILES['main_image']['name']);
    move_uploaded_file($_FILES['main_image']['tmp_name'], '../uploads/' . $main_image);
  }

  // --- Додаткові фото ---
  $additional_images = [];
  if (!empty($_FILES['additional_images']['name'][0])) {
    foreach ($_FILES['additional_images']['tmp_name'] as $i => $tmp) {
      $filename = basename($_FILES['additional_images']['name'][$i]);
      move_uploaded_file($tmp, '../uploads/' . $filename);
      $additional_images[] = $filename;
    }
  }

  $stmt = $pdo->prepare("INSERT INTO cars (
    name, year, registration_date, mileage_km, fuel_type, engine_cc, power_kw, power_hp, gearbox, body_type, owners, `keys`,
    damage_reported, damage_fixed, eco_class, seats, color, vin, description, paint_info, service_info, condition_description,
    start_time, end_time, main_image, additional_images, is_approved
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");

  $stmt->execute(array_merge(array_values($values), [$main_image, json_encode($additional_images)]));

  header("Location: lots.php");
  exit;
}

function field($label, $name, $type = 'text') {
  $value = $_POST[$name] ?? '';
  $safe = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
  echo "<div class='col-md-6'>
          <label class='form-label'>$label</label>
          <input type='$type' name='$name' value='$safe' class='form-control'>
        </div>";
}
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Додати авто</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
     <?php include 'header_admin.php'; ?>
<div class="container py-4">
  <h3>➕ Додати нове авто</h3>
  <form method="post" enctype="multipart/form-data" class="row g-3">
    <?php
    field('Назва', 'name');
    field('Рік', 'year');
    field('Перша реєстрація', 'registration_date', 'date');
    field('Пробіг', 'mileage_km');
    field('Пальне', 'fuel_type');
    field('Обʼєм двигуна', 'engine_cc');
    field('Потужність (kW)', 'power_kw');
    field('Потужність (HP)', 'power_hp');
    field('КПП', 'gearbox');
    field('Тип кузова', 'body_type');
    field('Власники', 'owners');
    field('Ключі', 'keys');
    field('Пошкодження', 'damage_reported');
    field('Усунено пошкодження', 'damage_fixed');
    field('Екоклас', 'eco_class');
    field('Сидіння', 'seats');
    field('Колір', 'color');
    field('VIN', 'vin');
    field('Опис', 'description');
    field('ЛКП', 'paint_info');
    field('Сервіс', 'service_info');
    field('Стан', 'condition_description');
    field('Початок аукціону', 'start_time', 'datetime-local');
    field('Завершення аукціону', 'end_time', 'datetime-local');
    ?>
    <div class='col-md-6'>
      <label class='form-label'>Головне фото</label>
      <input type='file' name='main_image' accept='image/*' class='form-control'>
    </div>
    <div class='col-md-6'>
      <label class='form-label'>Додаткові фото</label>
      <input type='file' name='additional_images[]' multiple accept='image/*' class='form-control'>
    </div>
    <div class="col-12">
      <button type="submit" class="btn btn-success">💾 Зберегти</button>
      <a href="lots.php" class="btn btn-secondary">Назад</a>
    </div>
  </form>
</div>
</body>
</html>
