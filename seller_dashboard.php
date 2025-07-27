<?php
// CODE ABOVE REMAINS UNCHANGED
?>
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Продати авто</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body {
      background-color: #f2f2f7;
      color: #000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    .card {
      border: none;
      border-radius: 20px;
      background-color: #e5e5ea;
      overflow: hidden;
    }
    .card-img-top {
      border-radius: 20px 20px 0 0;
    }
    .btn-primary {
      background-color: #007aff;
      border: none;
    }
    .btn-outline-primary {
      border-radius: 12px;
    }
    .badge-success {
      background-color: #32d74b;
    }
    .badge-warning {
      background-color: #ffd60a;
      color: #000;
    }
    .card-title {
      font-weight: 600;
      font-size: 1.25rem;
    }
    .form-control, .form-select {
      background-color: #d1d1d6;
      color: #000;
      border: none;
      border-radius: 10px;
    }
    .damage-item {
      margin-bottom: 10px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
  </style>
</head>
<body>
<?php include 'header.php'; ?>
<div class="container py-4">
  <h1 class="mb-4">Додати автомобіль</h1>
  <form method="post" enctype="multipart/form-data" class="row g-3 bg-white p-4 rounded-4 shadow-sm">
    <?php include 'components/car_form_fields.php'; ?>
    <div class="col-12">
      <button type="submit" class="btn btn-primary mt-3">Додати авто</button>
    </div>
  </form>

  <hr>
  <h2 class="mt-5">Мої авто</h2>
  <?php if (count($sellerCars) === 0): ?>
    <p class="text-muted">Ви ще не додали жодного авто.</p>
  <?php else: ?>
    <div class="row row-cols-1 row-cols-md-2 g-4">
      <?php foreach ($sellerCars as $car): ?>
        <div class="col">
          <div class="card h-100 shadow-sm">
            <img src="uploads/<?php echo htmlspecialchars($car['main_image']); ?>" class="card-img-top" style="max-height: 180px; object-fit: cover;" alt="">
            <div class="card-body">
              <h5 class="card-title">🚘 <?php echo htmlspecialchars($car['name']); ?></h5>
              <p class="card-text">📅 <?php echo $car['year']; ?> | 📍 <?php echo $car['mileage_km']; ?> км</p>
              <p class="card-text small text-muted">🔐 VIN: <?php echo htmlspecialchars($car['vin']); ?></p>
              <span class="badge bg-<?php echo $car['is_approved'] ? 'success' : 'warning'; ?>">
                <?php echo $car['is_approved'] ? 'Підтверджено' : 'Очікує модерації'; ?>
              </span>
            </div>
            <div class="card-footer bg-transparent border-0 text-end">
              <a href="edit_my_car.php?id=<?php echo $car['id']; ?>" class="btn btn-sm btn-outline-primary">✏️ Редагувати</a>
            </div>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
<script>
  function addDamageItem() {
    const container = document.createElement('div');
    container.className = 'damage-item';
    container.innerHTML = `
      <input type="file" name="damage_images[]" class="form-control" style="width: 200px;">
      <input type="text" name="damage_notes[]" class="form-control" placeholder="Опис пошкодження">
    `;
    document.getElementById('damageList').appendChild(container);
  }
</script>
</body>
</html>
