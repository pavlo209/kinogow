<?php
require 'config.php';
session_start();

$sellerId = $_SESSION['user_id'] ?? 0;
if (!$sellerId) {
    header("Location: login.php");
    exit;
}

$carId = $_GET['id'] ?? 0;
$stmt = $pdo->prepare("SELECT * FROM cars WHERE id = ? AND seller_id = ?");
$stmt->execute([$carId, $sellerId]);
$car = $stmt->fetch();

if (!$car) {
    echo "<p>Лот не знайдено</p>";
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fields = [
        'name', 'price_eur', 'year', 'mileage_km', 'gearbox', 'power_kw', 'engine_cc', 'fuel_type', 'vin',
        'inspection_date', 'damage_summary', 'paint_report', 'description', 'equipment_list', 'paint_info',
        'service_info', 'condition_description', 'color', 'end_time',
        'last_service_date', 'last_service_mileage', 'timing_belt_replacement_date', 'timing_belt_replacement_mileage'
    ];

    $data = [];
    foreach ($fields as $field) {
        $data[$field] = $_POST[$field] ?? null;
    }

    // Головне фото
    $main_image = $car['main_image'];
    if (!empty($_FILES['main_image']['name'])) {
        $main_image = time() . '_' . basename($_FILES['main_image']['name']);
        move_uploaded_file($_FILES['main_image']['tmp_name'], 'uploads/' . $main_image);
    }

    // Додаткові фото
    $additional_images = json_decode($car['additional_images'], true) ?: [];
    if (!empty($_FILES['additional_images']['name'][0])) {
        foreach ($_FILES['additional_images']['tmp_name'] as $i => $tmpName) {
            $filename = time() . '_' . basename($_FILES['additional_images']['name'][$i]);
            move_uploaded_file($tmpName, 'uploads/' . $filename);
            $additional_images[] = $filename;
        }
    }

    // Фото пошкоджень
    $damage_gallery = json_decode($car['damage_gallery'], true) ?: [];
    if (!empty($_FILES['damage_images']['name'][0])) {
        foreach ($_FILES['damage_images']['tmp_name'] as $i => $tmpName) {
            $filename = time() . '_' . basename($_FILES['damage_images']['name'][$i]);
            move_uploaded_file($tmpName, 'uploads/' . $filename);
            $note = $_POST['damage_notes'][$i] ?? '';
            $damage_gallery[] = ['file' => $filename, 'note' => $note];
        }
    }

    // Фото сервісної історії
    $service_gallery = json_decode($car['service_gallery'], true) ?: [];
    if (!empty($_FILES['service_images']['name'][0])) {
        foreach ($_FILES['service_images']['tmp_name'] as $i => $tmpName) {
            $filename = time() . '_' . basename($_FILES['service_images']['name'][$i]);
            move_uploaded_file($tmpName, 'uploads/' . $filename);
            $service_gallery[] = ['file' => $filename];
        }
    }

    $stmt = $pdo->prepare("UPDATE cars SET
        name = ?, price_eur = ?, year = ?, mileage_km = ?, gearbox = ?, power_kw = ?, engine_cc = ?, fuel_type = ?, vin = ?,
        inspection_date = ?, damage_summary = ?, paint_report = ?, main_image = ?, additional_images = ?, description = ?,
        equipment_list = ?, paint_info = ?, service_info = ?, condition_description = ?, color = ?, end_time = ?, 
        damage_gallery = ?, service_gallery = ?, last_service_date = ?, last_service_mileage = ?, 
        timing_belt_replacement_date = ?, timing_belt_replacement_mileage = ?
        WHERE id = ? AND seller_id = ?");

    $stmt->execute([
        $data['name'], $data['price_eur'], $data['year'], $data['mileage_km'], $data['gearbox'], $data['power_kw'], $data['engine_cc'],
        $data['fuel_type'], $data['vin'], $data['inspection_date'], $data['damage_summary'], $data['paint_report'], $main_image,
        json_encode($additional_images), $data['description'], $data['equipment_list'], $data['paint_info'], $data['service_info'],
        $data['condition_description'], $data['color'], $data['end_time'], 
        json_encode($damage_gallery), json_encode($service_gallery),
        $data['last_service_date'], $data['last_service_mileage'], $data['timing_belt_replacement_date'], $data['timing_belt_replacement_mileage'],
        $carId, $sellerId
    ]);

    echo "<div class='alert alert-success'>✅ Лот оновлено</div>";
}
?>

<!-- HTML-форма -->
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Редагування авто</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
<?php include 'header.php'; ?>
<div class="container py-4">
  <h1>Редагування авто: <?php echo htmlspecialchars($car['name']); ?></h1>
  <form method="post" enctype="multipart/form-data" class="row g-3">
    <?php include 'components/car_form_fields.php'; ?>

    <!-- Фото сервісної історії -->
    <div class="col-12">
      <label class="form-label fw-semibold">Фото сервісної історії:</label>
      <input type="file" name="service_images[]" class="form-control mb-3" accept="image/*" multiple>
    </div>

    <!-- Сервісні дати -->
    <div class="col-md-6">
      <label class="form-label fw-semibold">Останній сервіс (дата):</label>
      <input type="date" name="last_service_date" class="form-control mb-3" value="<?php echo $car['last_service_date'] ?? ''; ?>">
    </div>
    <div class="col-md-6">
      <label class="form-label fw-semibold">Останній сервіс (пробіг):</label>
      <input type="number" name="last_service_mileage" class="form-control mb-3" value="<?php echo $car['last_service_mileage'] ?? ''; ?>">
    </div>

    <!-- Заміна ГРМ -->
    <div class="col-md-6">
      <label class="form-label fw-semibold">Заміна ГРМ (дата):</label>
      <input type="date" name="timing_belt_replacement_date" class="form-control mb-3" value="<?php echo $car['timing_belt_replacement_date'] ?? ''; ?>">
    </div>
    <div class="col-md-6">
      <label class="form-label fw-semibold">Заміна ГРМ (пробіг):</label>
      <input type="number" name="timing_belt_replacement_mileage" class="form-control mb-3" value="<?php echo $car['timing_belt_replacement_mileage'] ?? ''; ?>">
    </div>

    <div class="col-12 text-end">
      <button type="submit" class="btn btn-success">💾 Зберегти</button>
    </div>
  </form>
</div>
</body>
</html>
