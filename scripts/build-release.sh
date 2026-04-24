#!/usr/bin/env bash

set -euo pipefail

project_name="git-workload-report"
version="${VERSION:-}"

if [ -z "$version" ]
then
    version=$(node -e "console.log(require('./package.json').version)")
fi

release_dir="release"
artifact_dir="$release_dir/$project_name"
artifact_file="$project_name-v$version.tar.gz"

rm -rf "$release_dir" "$artifact_file"
mkdir -p "$artifact_dir/bin" "$artifact_dir/public"

cp bin/git-workload-report.sh "$artifact_dir/bin/"
cp start.sh "$artifact_dir/"
cp directory.txt "$artifact_dir/"
cp -R public/local-report "$artifact_dir/public/"
cp README.md LICENSE "$artifact_dir/"
chmod +x "$artifact_dir/bin/git-workload-report.sh"
chmod +x "$artifact_dir/start.sh"

COPYFILE_DISABLE=1 LC_ALL=C tar -czf "$artifact_file" -C "$release_dir" "$project_name"

echo "已生成本地制品：$artifact_file"
