'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Reminder extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Reminder.init({
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    recipientId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    dueAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    repeat: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'sent', 'cancelled'),
      allowNull: false,
      defaultValue: 'scheduled'

    }
  }, {
    sequelize,
    modelName: 'Reminder',
  });
  return Reminder;
};