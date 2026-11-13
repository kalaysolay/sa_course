# ARCH-STORAGE — Source Pack (карта утверждений → источники)

Проверка URL: 11.11.2026, страницы fetch-ились напрямую (webfetch), статус verified.

## Verified — утверждение → источник

### SRC-AWS-S3-USER-GUIDE — AWS S3 User Guide (4 страницы)
URL: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
- Объект = файл + метаданные, корзина = контейнер, ключ — уникальный адрес объекта (Welcome).
- «The Amazon S3 data model is a flat structure… There is no hierarchy of subbuckets or subfolders»; «папка» — лишь префикс в ключе, в консоли — объект-заглушка (object-keys).
- Версионирование: «keeping multiple variants of an object in the same bucket», «You can always restore the previous version»; удаление → delete marker, перезапись → новая версия; по умолчанию выключено (Versioning).
- Lifecycle: удаление по сроку («expire objects after … regulatory compliance period»), правила касаются и существующих объектов; политикой корзины удаление не запретить (object-lifecycle-mgmt).
- Доступ по HTTP: REST API (создание, чтение, удаление), по умолчанию приватно; надёжность — «replicating data across multiple servers», дублирование между Availability Zones (Welcome).
Оговорка: вендорский гайд → поведение без классов хранения и цифр.

### SRC-MS-AZURE-STORAGE — Microsoft Learn: Blob Storage + Azure Files
URL: https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction https://learn.microsoft.com/en-us/azure/storage/files/storage-files-introduction
- Blob: «object storage solution … optimized for storing massive amounts of unstructured data»; доступ по HTTP/HTTPS «from anywhere in the world», REST API.
- Blob: storage account → container → blob; «A container organizes a set of blobs, similar to a directory in a file system».
- Blob: page blobs «serve as disks for Azure virtual machines» → связка с блочным хранилищем.
- Files: «fully managed file shares … SMB and NFS … mount … concurrently from cloud and on-premises clients»; доступ через «file system I/O APIs» или REST API; «Shared access».
Оговорка: «blob» — вендорский термин → в лекции «объект».

### SRC-AWS-EFS-EBS — AWS: EFS Features + Elastic Block Store
URL: https://aws.amazon.com/efs/features/ https://aws.amazon.com/ebs/
- EFS (файловое): «network file sharing (NFS) shared file system storage»; POSIX-подобная семантика — «traditional file permissions model, file locking, and hierarchical directory structure»; хранение «across multiple Availability Zones».
- EBS (блочное): «create a file system on top of these volumes, run a database»; том «automatically replicated» внутри Availability Zone.
Оговорка: EFS/EBS — только для разграничения видов хранилища.

### SRC-GCS-OBJECTS — Google Cloud Storage docs «About objects» + «Hierarchical namespace»
URL: https://docs.cloud.google.com/storage/docs/objects https://docs.cloud.google.com/storage/docs/hns-overview
- «Objects have two components: object data and object metadata».
- Flat namespace: «…always create objects directly under the bucket… there are no directories or folders that objects exist within».
- «cannot be directly renamed… indirectly rename an object by copying and deleting the original object»; перенос «папки» — копирование и удаление, не атомарно.
- Объект неизменяем, замена атомарна; имя + generation идентифицируют объект; «object names appear in URLs» → антикейс про персональные данные.
- Иерархия — отдельная опция (при создании корзины, потом не меняется): настоящие каталоги, атомарное переименование (hns-overview). Нужна, чтобы «плоская структура» не была безусловной истиной.

## LO → источники
LO1 → EBS, Azure Blob, Azure Files, EFS; LO2 → Azure Files, EFS; LO3 → S3, Azure Blob, GCS; LO4 → S3 object-keys, GCS; LO5 → S3 Versioning, S3 Lifecycle, GCS; LO6 → S3 (доступ, приватность), S3 Lifecycle (срок).

## Недоступные / не цитировать (webfetch 11.11.2026)
- 404: cloud.google.com/storage/docs/object-storage-overview; docs.cloud.google.com/storage/docs/{object-metadata,objects-overview,object-attributes,lifecycle-management}.
- Пустой ответ: docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs.html; docs.aws.amazon.com/efs/latest/ug/{efs-introduction,whatis-efs}.html; docs.aws.amazon.com/AmazonS3/latest/userguide/UsingCopyObject.html. EFS — по Features, переименование — из GCS Objects.
- cloud.google.com/storage/docs — лендинг без утверждений.

## Gaps
- SRC-AUTHOR-MATERIALS — missing: авторских материалов нет; не ссылаться и не выдавать за прочитанные.
- Профильного источника в реестре нет (срез: только SRC-AUTHOR-MATERIALS); внешние — по решению автора 11.11.2026.
- «Дублирование внутри площадки» в бытовых словах нет — переводим «replicating across Availability Zones».
- Отраслевых сроков хранения для Compliance нет — срок как пример политики компании.
