<?php
require '../config.php';
session_start();

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

if (!($_SESSION['is_admin'] ?? false)) {
  header("Location: ../login.php");
  exit;
}

$carId = $_GET['id'] ?? 0;
$stmt = $pdo->prepare("SELECT * FROM cars WHERE id = ?");
$stmt->execute([$carId]);
$car = $stmt->fetch();

if (!$car) {
  echo "<p>Авто не знайдено</p>";
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $fields = [
    'name', 'year', 'registration_date', 'engine_cc', 'gearbox', 'mileage_km', 'fuel_type',
    'power_kw', 'power_hp', 'body_type', 'owners', 'keys', 'damage_reported', 'damage_fixed',
    'eco_class', 'seats', 'color', 'vin', 'description', 'service_info',
    'condition_description', 'paint_info', 'inspection_date', 'damage_summary', 'paint_report'
  ];

  $data = [];
  foreach ($fields as $field) {
    $data[$field] = $_POST[$field] ?? '';
  }

  if (!empty($_FILES['main_image']['name'])) {
    $main_image = basename($_FILES['main_image']['name']);
    move_uploaded_file($_FILES['main_image']['tmp_name'], '../uploads/' . $main_image);
    $data['main_image'] = $main_image;
  } else {
    $data['main_image'] = $car['main_image'];
  }

  $additional_images = json_decode($car['additional_images'] ?? '[]', true);
  if (!empty($_FILES['additional_images']['name'][0])) {
    foreach ($_FILES['additional_images']['tmp_name'] as $i => $tmpName) {
      $filename = basename($_FILES['additional_images']['name'][$i]);
      move_uploaded_file($tmpName, '../uploads/' . $filename);
      $additional_images[] = $filename;
    }
  }

  $damage_gallery = json_decode($car['damage_gallery'] ?? '[]', true);
  if (!empty($_FILES['damage_images']['name'][0])) {
    foreach ($_FILES['damage_images']['tmp_name'] as $i => $tmpName) {
      $filename = basename($_FILES['damage_images']['name'][$i]);
      move_uploaded_file($tmpName, '../uploads/' . $filename);
      $note = $_POST['damage_notes'][$i] ?? '';
      $damage_gallery[] = ['file' => $filename, 'note' => $note];
    }
  }

  $update = $pdo->prepare("UPDATE cars SET
    name = :name, year = :year, registration_date = :registration_date, engine_cc = :engine_cc,
    gearbox = :gearbox, mileage_km = :mileage_km, fuel_type = :fuel_type,
    power_kw = :power_kw, power_hp = :power_hp, body_type = :body_type,
    owners = :owners, keys = :keys, damage_reported = :damage_reported, damage_fixed = :damage_fixed,
    eco_class = :eco_class, seats = :seats, color = :color, vin = :vin,
    main_image = :main_image, additional_images = :additional_images,
    description = :description, service_info = :service_info,
    condition_description = :condition_description, paint_info = :paint_info,
    inspection_date = :inspection_date, damage_summary = :damage_summary,
    paint_report = :paint_report, damage_gallery = :damage_gallery
    WHERE id = :id
  ");

  $data['additional_images'] = json_encode($additional_images);
  $data['damage_gallery'] = json_encode($damage_gallery);
  $data['id'] = $carId;

  $update->execute($data);

  echo "<p class='alert alert-success'>Зміни збережено ✅</p>";
  $stmt->execute([$carId]);
  $car = $stmt->fetch(); // Перечитуємо авто після оновлення
}
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Редагування авто</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
<?php include '../header.php'; ?>
<div class="container py-4">
  <h1>✏️ Редагування лота №<?php echo $car['id']; ?></h1>
  <form method="post" enctype="multipart/form-data">
    <?php include '../components/car_form_fields.php'; ?>
    <button type="submit" class="btn btn-success mt-3">💾 Зберегти зміни</button>
    <a href="lots.php" class="btn btn-secondary mt-3">Назад</a>
  </form>
</div>
</body>
</html>
