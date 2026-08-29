# VPC 10.20.0.0/16, 2 AZ, subredes públicas/privadas, IGW, 1 NAT (doc 07 §9).
# En dev NO se crean endpoints Interface (doc 16 §2): solo los Gateway gratis.
variable "entorno" { type = string }
variable "cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "habilitar_endpoints_interface" {
  type    = bool
  default = false
}

data "aws_availability_zones" "disponibles" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.disponibles.names, 0, 2)
}

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "edtech-${var.entorno}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "edtech-${var.entorno}-igw" }
}

resource "aws_subnet" "publicas" {
  count                   = 2
  vpc_id                  = aws_vpc.principal.id
  cidr_block              = cidrsubnet(var.cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "edtech-${var.entorno}-publica-${local.azs[count.index]}" }
}

resource "aws_subnet" "privadas" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet(var.cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]
  tags              = { Name = "edtech-${var.entorno}-privada-${local.azs[count.index]}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "edtech-${var.entorno}-nat-eip" }
}

# Un solo NAT en dev (doc 07 §9); dos en prod, uno por AZ
resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.publicas[0].id
  tags          = { Name = "edtech-${var.entorno}-nat" }
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = { Name = "edtech-${var.entorno}-rt-publica" }
}

resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = { Name = "edtech-${var.entorno}-rt-privada" }
}

resource "aws_route_table_association" "publicas" {
  count          = 2
  subnet_id      = aws_subnet.publicas[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table_association" "privadas" {
  count          = 2
  subnet_id      = aws_subnet.privadas[count.index].id
  route_table_id = aws_route_table.privada.id
}

# Endpoints Gateway: gratis, siempre
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.privada.id, aws_route_table.publica.id]
  tags              = { Name = "edtech-${var.entorno}-vpce-s3" }
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.us-east-1.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.privada.id, aws_route_table.publica.id]
  tags              = { Name = "edtech-${var.entorno}-vpce-dynamodb" }
}

# Endpoints Interface: solo si se piden (prod). En dev el tráfico sale por el NAT.
locals {
  servicios_interface = var.habilitar_endpoints_interface ? [
    "ecr.api", "ecr.dkr", "secretsmanager", "logs", "sqs", "events"
  ] : []
}

resource "aws_security_group" "endpoints" {
  count       = var.habilitar_endpoints_interface ? 1 : 0
  name        = "edtech-${var.entorno}-vpce"
  description = "HTTPS desde la VPC hacia los endpoints"
  vpc_id      = aws_vpc.principal.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.cidr]
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(local.servicios_interface)
  vpc_id              = aws_vpc.principal.id
  service_name        = "com.amazonaws.us-east-1.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.privadas[*].id
  security_group_ids  = [aws_security_group.endpoints[0].id]
  private_dns_enabled = true
  tags                = { Name = "edtech-${var.entorno}-vpce-${each.value}" }
}

output "vpc_id" { value = aws_vpc.principal.id }
output "vpc_cidr" { value = aws_vpc.principal.cidr_block }
output "subredes_publicas" { value = aws_subnet.publicas[*].id }
output "subredes_privadas" { value = aws_subnet.privadas[*].id }
